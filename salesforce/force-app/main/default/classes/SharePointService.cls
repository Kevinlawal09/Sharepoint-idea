/**
 * Lists SharePoint folders and files for the sharePointFiles LWC via Microsoft Graph.
 *
 * Existing SharePoint links are stored unchanged in SharePoint_Location__mdt. Graph's
 * /shares endpoint resolves a normal SharePoint URL to its drive item, so no site or
 * drive ids need to be looked up by hand.
 *
 * Callouts go through the MS_Graph Named Credential (per-user OAuth), so people only
 * see what SharePoint already lets them open. Until that is configured, the
 * Intranet_Setting__mdt.Default record keeps Use_Mock_SharePoint__c on and sample
 * files are returned instead.
 */
public with sharing class SharePointService {

    private static final String GRAPH = 'callout:MS_Graph';
    private static final String GRAPH_HOST = 'https://graph.microsoft.com';
    private static final Integer MAX_PAGES = 5;

    /** null = follow Intranet_Setting__mdt; true/false = force mock or live (tests only). */
    @TestVisible
    private static Boolean mockOverride;

    public class Location implements Comparable {
        @AuraEnabled public String id;
        @AuraEnabled public String label;
        @AuraEnabled public String url;
        @AuraEnabled public String department;
        @AuraEnabled public String category;
        @AuraEnabled public Decimal sortOrder;

        public Integer compareTo(Object other) {
            Location that = (Location) other;
            Decimal mine = sortOrder == null ? 9999 : sortOrder;
            Decimal theirs = that.sortOrder == null ? 9999 : that.sortOrder;
            if (mine != theirs) {
                return mine < theirs ? -1 : 1;
            }
            return label.compareTo(that.label);
        }
    }

    public class FileItem {
        @AuraEnabled public String id;
        @AuraEnabled public String driveId;
        @AuraEnabled public String name;
        @AuraEnabled public Boolean isFolder;
        @AuraEnabled public Integer childCount;
        @AuraEnabled public String webUrl;
        @AuraEnabled public Long size;
        @AuraEnabled public String modified;
        @AuraEnabled public String modifiedBy;
    }

    /** Configured SharePoint links, optionally filtered to one department. */
    @AuraEnabled(cacheable=true)
    public static List<Location> getLocations(String department) {
        // SOQL rather than getAll(): getAll() truncates long text fields to 255 characters.
        List<SharePoint_Location__mdt> rows = String.isBlank(department)
            ? [SELECT DeveloperName, MasterLabel, Url__c, Department__c, Category__c, Sort_Order__c
               FROM SharePoint_Location__mdt]
            : [SELECT DeveloperName, MasterLabel, Url__c, Department__c, Category__c, Sort_Order__c
               FROM SharePoint_Location__mdt WHERE Department__c = :department];

        List<Location> locations = new List<Location>();
        for (SharePoint_Location__mdt row : rows) {
            Location loc = new Location();
            loc.id = row.DeveloperName;
            loc.label = row.MasterLabel;
            loc.url = row.Url__c == null ? null : row.Url__c.trim();
            loc.department = row.Department__c;
            loc.category = row.Category__c;
            loc.sortOrder = row.Sort_Order__c;
            locations.add(loc);
        }
        locations.sort();
        return locations;
    }

    /** Opens an existing SharePoint link: a folder returns its contents, a file returns itself. */
    @AuraEnabled(cacheable=true)
    public static List<FileItem> listFromLink(String sharePointUrl) {
        if (String.isBlank(sharePointUrl)) {
            throw newError('No SharePoint link was provided.');
        }
        if (useMock()) {
            return mockRoot();
        }

        String sharePath = '/v1.0/shares/' + encodeShareUrl(normalizeLink(sharePointUrl)) + '/driveItem';
        FileItem resolved = toFileItem(callGraph(sharePath));
        if (!resolved.isFolder) {
            return new List<FileItem>{ resolved };
        }
        if (resolved.driveId == null) {
            return listChildren(sharePath + '/children?$top=200');
        }
        return listFolder(resolved.driveId, resolved.id);
    }

    @AuraEnabled(cacheable=true)
    public static List<FileItem> listFolder(String driveId, String itemId) {
        if (String.isBlank(driveId) || String.isBlank(itemId)) {
            throw newError('That folder could not be opened.');
        }
        if (useMock()) {
            return mockFolder(driveId, itemId);
        }
        return listChildren(
            '/v1.0/drives/' + EncodingUtil.urlEncode(driveId, 'UTF-8') +
            '/items/' + EncodingUtil.urlEncode(itemId, 'UTF-8') +
            '/children?$top=200'
        );
    }

    /**
     * Unwraps links people copy from Outlook or the OneDrive web view into the real SharePoint URL:
     *   - Outlook Safe Links:   https://...safelinks.protection.outlook.com/?url=<encoded link>
     *   - OneDrive web view:    .../_layouts/15/onedrive.aspx?...&s=<base64 sharing link>
     *                           .../_layouts/15/onedrive.aspx?id=/sites/Team/Shared Documents/Folder
     * Anything else is returned unchanged (trimmed).
     */
    @TestVisible
    private static String normalizeLink(String url) {
        String link = url.trim();
        Map<String, String> params = queryParams(link);

        if (link.containsIgnoreCase('safelinks.protection.outlook.com') && params.containsKey('url')) {
            return normalizeLink(params.get('url'));
        }
        if (link.containsIgnoreCase('/_layouts/15/onedrive.aspx')) {
            if (params.containsKey('s')) {
                String encoded = params.get('s').replace('-', '+').replace('_', '/');
                while (Math.mod(encoded.length(), 4) != 0) {
                    encoded += '=';
                }
                return EncodingUtil.base64Decode(encoded).toString();
            }
            if (params.containsKey('id')) {
                String host = link.substringBefore('/_layouts/');
                if (host.contains('/sites/') || host.contains('/teams/')) {
                    host = host.substringBefore(host.contains('/sites/') ? '/sites/' : '/teams/');
                }
                return host + params.get('id').replace(' ', '%20');
            }
        }
        return link;
    }

    private static Map<String, String> queryParams(String url) {
        Map<String, String> params = new Map<String, String>();
        if (!url.contains('?')) {
            return params;
        }
        for (String pair : url.substringAfter('?').split('&')) {
            String name = pair.substringBefore('=').toLowerCase();
            if (String.isNotBlank(name) && !params.containsKey(name)) {
                params.put(name, EncodingUtil.urlDecode(pair.substringAfter('='), 'UTF-8'));
            }
        }
        return params;
    }

    /** Graph sharing token: "u!" + unpadded base64url of the URL. */
    @TestVisible
    private static String encodeShareUrl(String url) {
        String base64 = EncodingUtil.base64Encode(Blob.valueOf(url));
        return 'u!' + base64.removeEnd('=').removeEnd('=').replace('/', '_').replace('+', '-');
    }

    private static List<FileItem> listChildren(String path) {
        List<FileItem> items = new List<FileItem>();
        String next = path;
        Integer pages = 0;
        while (next != null && pages < MAX_PAGES) {
            Map<String, Object> page = callGraph(next);
            for (Object child : (List<Object>) page.get('value')) {
                items.add(toFileItem((Map<String, Object>) child));
            }
            String nextLink = (String) page.get('@odata.nextLink');
            next = nextLink == null ? null : nextLink.removeStart(GRAPH_HOST);
            pages++;
        }
        return items;
    }

    private static Map<String, Object> callGraph(String path) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(GRAPH + path);
        req.setMethod('GET');
        req.setHeader('Accept', 'application/json');
        req.setTimeout(20000);

        HttpResponse res;
        try {
            res = new Http().send(req);
        } catch (CalloutException e) {
            throw newError(
                'Could not reach SharePoint. If this is your first time, connect your Microsoft account ' +
                'from your Salesforce personal settings (External Credentials). Details: ' + e.getMessage()
            );
        }

        Integer status = res.getStatusCode();
        if (status == 401 || status == 403) {
            throw newError('You don\'t have access to this SharePoint location, or your Microsoft connection has expired.');
        }
        if (status == 404) {
            throw newError('That SharePoint link no longer exists. Ask an intranet admin to update it.');
        }
        if (status != 200) {
            throw newError('SharePoint returned an error (' + status + '). Try again in a moment.');
        }
        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }

    private static FileItem toFileItem(Map<String, Object> raw) {
        FileItem item = new FileItem();
        item.id = (String) raw.get('id');
        item.name = (String) raw.get('name');
        item.webUrl = (String) raw.get('webUrl');
        item.modified = (String) raw.get('lastModifiedDateTime');
        item.size = raw.get('size') == null ? null : Long.valueOf(String.valueOf(raw.get('size')));

        Map<String, Object> folder = (Map<String, Object>) raw.get('folder');
        item.isFolder = folder != null;
        item.childCount = folder == null ? null : (Integer) folder.get('childCount');

        Map<String, Object> parent = (Map<String, Object>) raw.get('parentReference');
        item.driveId = parent == null ? null : (String) parent.get('driveId');

        Map<String, Object> lastModifiedBy = (Map<String, Object>) raw.get('lastModifiedBy');
        Map<String, Object> user = lastModifiedBy == null ? null : (Map<String, Object>) lastModifiedBy.get('user');
        item.modifiedBy = user == null ? null : (String) user.get('displayName');
        return item;
    }

    private static Boolean useMock() {
        if (mockOverride != null) {
            return mockOverride;
        }
        Intranet_Setting__mdt setting = Intranet_Setting__mdt.getInstance('Default');
        return setting == null || setting.Use_Mock_SharePoint__c;
    }

    // ------------------------------------------------------------ Mock data

    private static final String MOCK_DRIVE = 'mock-drive';

    private static List<FileItem> mockRoot() {
        return new List<FileItem>{
            mockItem('mock-policies', 'Policies', true, null, 3),
            mockItem('mock-forms', 'Forms', true, null, 3),
            mockItem('mock-handbook', 'Employee Handbook 2026.pdf', false, 2457600, null),
            mockItem('mock-benefits', 'Benefits Overview.docx', false, 318000, null),
            mockItem('mock-orgchart', 'Org Chart.pptx', false, 1830000, null),
            mockItem('mock-budget', 'Budget Calendar FY27.xlsx', false, 96000, null)
        };
    }

    private static List<FileItem> mockFolder(String driveId, String itemId) {
        String prefix = itemId == 'mock-forms' ? 'Form' : 'Policy';
        return new List<FileItem>{
            mockItem(itemId + '-1', prefix + ' - Remote Work.pdf', false, 412000, null),
            mockItem(itemId + '-2', prefix + ' - Travel & Expenses.docx', false, 128000, null),
            mockItem(itemId + '-3', prefix + ' - Code of Conduct.pdf', false, 905000, null)
        };
    }

    private static FileItem mockItem(String id, String name, Boolean isFolder, Long size, Integer childCount) {
        FileItem item = new FileItem();
        item.id = id;
        item.driveId = MOCK_DRIVE;
        item.name = name;
        item.isFolder = isFolder;
        item.size = size;
        item.childCount = childCount;
        item.webUrl = 'https://example.sharepoint.com/mock/' + EncodingUtil.urlEncode(name, 'UTF-8');
        item.modified = System.now().addDays(-3).formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
        item.modifiedBy = 'Sample User';
        return item;
    }

    private static AuraHandledException newError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }
}