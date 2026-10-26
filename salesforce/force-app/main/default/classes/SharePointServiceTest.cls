@IsTest
private class SharePointServiceTest {

    private class GraphMock implements HttpCalloutMock {
        private final Integer status;

        GraphMock(Integer status) {
            this.status = status;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(status);
            if (status != 200) {
                res.setBody('{"error":{"code":"itemNotFound"}}');
            } else if (req.getEndpoint().contains('/shares/')) {
                res.setBody(
                    '{"id":"folder1","name":"Policies","folder":{"childCount":2},' +
                    '"parentReference":{"driveId":"drive1"},"webUrl":"https://contoso.sharepoint.com/Policies"}'
                );
            } else {
                res.setBody(
                    '{"value":[' +
                    '{"id":"f1","name":"Handbook.pdf","size":1024,"lastModifiedDateTime":"2026-10-01T12:00:00Z",' +
                    '"webUrl":"https://contoso.sharepoint.com/Handbook.pdf","parentReference":{"driveId":"drive1"},' +
                    '"lastModifiedBy":{"user":{"displayName":"Priya Nair"}}},' +
                    '{"id":"f2","name":"Forms","folder":{"childCount":3},"parentReference":{"driveId":"drive1"}}' +
                    ']}'
                );
            }
            return res;
        }
    }

    @IsTest
    static void shareUrlIsEncodedForGraph() {
        Assert.areEqual('u!aHR0cHM6Ly9h', SharePointService.encodeShareUrl('https://a'));
        Assert.areEqual('u!aHR0cHM6Ly9hYg', SharePointService.encodeShareUrl('https://ab'), 'Padding should be stripped');
    }

    @IsTest
    static void linksCopiedFromOutlookAndOneDriveAreUnwrapped() {
        String folderLink = 'https://uwpbc.sharepoint.com/:f:/s/FinanceTeamMeetings/IgCXBq0FbEWbSIdfM7P7a56XAWFxposKT9AwR2tdSq7zyPE';
        String token = EncodingUtil.base64Encode(Blob.valueOf(folderLink)).removeEnd('=').removeEnd('=');

        String oneDriveView = 'https://uwpbc.sharepoint.com/sites/FinanceTeamMeetings/_layouts/15/onedrive.aspx?p=26&s='
            + EncodingUtil.urlEncode(token, 'UTF-8') + '&LOF=1&CT=1787171131037&OR=OWA%2DNT%2DMail';
        Assert.areEqual(folderLink, SharePointService.normalizeLink(oneDriveView));

        String safeLink = 'https://nam12.safelinks.protection.outlook.com/?url=' + EncodingUtil.urlEncode(oneDriveView, 'UTF-8') + '&data=x';
        Assert.areEqual(folderLink, SharePointService.normalizeLink(safeLink));

        String byPath = 'https://uwpbc.sharepoint.com/sites/HR/_layouts/15/onedrive.aspx?id=%2Fsites%2FHR%2FShared%20Documents%2FPolicies';
        Assert.areEqual('https://uwpbc.sharepoint.com/sites/HR/Shared%20Documents/Policies', SharePointService.normalizeLink(byPath));

        Assert.areEqual(folderLink, SharePointService.normalizeLink('  ' + folderLink + ' '));
    }

    @IsTest
    static void mockModeReturnsSampleFiles() {
        SharePointService.mockOverride = true;

        List<SharePointService.FileItem> root = SharePointService.listFromLink('https://contoso.sharepoint.com/sites/HR');
        Assert.isFalse(root.isEmpty());

        SharePointService.FileItem folder;
        for (SharePointService.FileItem item : root) {
            if (item.isFolder) {
                folder = item;
                break;
            }
        }
        Assert.isNotNull(folder, 'Mock root should include a folder');
        Assert.areEqual(3, SharePointService.listFolder(folder.driveId, folder.id).size());
    }

    @IsTest
    static void liveModeResolvesLinkAndListsFolder() {
        SharePointService.mockOverride = false;
        Test.setMock(HttpCalloutMock.class, new GraphMock(200));

        Test.startTest();
        List<SharePointService.FileItem> items = SharePointService.listFromLink('https://contoso.sharepoint.com/sites/HR/Policies');
        Test.stopTest();

        Assert.areEqual(2, items.size());
        Assert.areEqual('Handbook.pdf', items[0].name);
        Assert.areEqual(1024L, items[0].size);
        Assert.areEqual('Priya Nair', items[0].modifiedBy);
        Assert.isFalse(items[0].isFolder);
        Assert.isTrue(items[1].isFolder);
        Assert.areEqual(3, items[1].childCount);
    }

    @IsTest
    static void missingLinkGivesFriendlyError() {
        SharePointService.mockOverride = false;
        Test.setMock(HttpCalloutMock.class, new GraphMock(404));

        try {
            SharePointService.listFromLink('https://contoso.sharepoint.com/sites/Gone');
            Assert.fail('Expected a 404 to raise an error');
        } catch (AuraHandledException e) {
            Assert.isTrue(e.getMessage().contains('no longer exists'));
        }
    }

    @IsTest
    static void locationsAreFilteredByDepartment() {
        for (SharePointService.Location loc : SharePointService.getLocations('executive-hr')) {
            Assert.areEqual('executive-hr', loc.department);
        }
        Assert.isNotNull(SharePointService.getLocations(''));
    }
}