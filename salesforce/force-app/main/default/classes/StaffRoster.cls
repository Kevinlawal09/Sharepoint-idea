/**
 * Everyone on staff: the org chart (Org_Chart_Person__mdt) merged with active Salesforce users.
 *
 * - A chart person with a matching user shows as that user (photo, contact details, stories).
 * - A chart person without a user is a placeholder keyed "ph:<DeveloperName>". Creating their
 *   user later swaps the placeholder for the real person automatically.
 * - Users not on the chart still appear.
 *
 * Reporting lines use the user's Manager when set, otherwise the chart's Reports_To__c.
 */
public with sharing class StaffRoster {

    public static final String PLACEHOLDER_PREFIX = 'ph:';

    @TestVisible
    private static List<Org_Chart_Person__mdt> chartOverride;

    public class Member implements Comparable {
        public String key;
        public Id userId;
        public String chartKey;
        public String name;
        public String firstName;
        public String lastName;
        public String title;
        public String department;
        public String email;
        public String phone;
        public String mobile;
        public String photoUrl;
        public String city;
        public String managerKey;
        public Boolean isPlaceholder = false;

        public String initials() {
            String first = String.isBlank(firstName) ? '' : firstName.left(1);
            String last = String.isBlank(lastName) ? '' : lastName.left(1);
            return (first + last).toUpperCase();
        }

        public Integer compareTo(Object other) {
            Member that = (Member) other;
            Integer byLast = (lastName == null ? '' : lastName).compareTo(that.lastName == null ? '' : that.lastName);
            return byLast != 0 ? byLast : (name == null ? '' : name).compareTo(that.name == null ? '' : that.name);
        }
    }

    public static List<Org_Chart_Person__mdt> chart() {
        if (chartOverride != null) {
            return chartOverride;
        }
        return [
            SELECT DeveloperName, MasterLabel, First_Name__c, Last_Name__c, Other_First_Names__c,
                Title__c, Department__c, Reports_To__c
            FROM Org_Chart_Person__mdt
        ];
    }

    /** Chart DeveloperName -> the one active user it matches. Used by the roster and the org chart loader. */
    public static Map<String, User> matchUsers(List<Org_Chart_Person__mdt> chart, List<User> users) {
        Map<String, User> matches = new Map<String, User>();
        Set<Id> taken = new Set<Id>();
        for (Org_Chart_Person__mdt entry : chart) {
            User match;
            Integer hits = 0;
            for (User u : users) {
                if (nameMatches(u, entry)) {
                    match = u;
                    hits++;
                }
            }
            if (hits == 1 && !taken.contains(match.Id)) {
                matches.put(entry.DeveloperName, match);
                taken.add(match.Id);
            }
        }
        return matches;
    }

    public static List<Member> members() {
        List<User> users = [
            SELECT Id, Name, FirstName, LastName, Title, Department, Email, Phone, MobilePhone,
                FullPhotoUrl, ManagerId, City
            FROM User
            WHERE IsActive = true AND UserType = 'Standard'
            WITH USER_MODE
            ORDER BY LastName, FirstName
            LIMIT 2000
        ];
        List<Org_Chart_Person__mdt> chart = chart();

        Map<String, Org_Chart_Person__mdt> entryByKey = new Map<String, Org_Chart_Person__mdt>();
        for (Org_Chart_Person__mdt entry : chart) {
            entryByKey.put(entry.DeveloperName, entry);
        }
        Map<String, User> userByChartKey = matchUsers(chart, users);
        Map<Id, String> chartKeyByUser = new Map<Id, String>();
        for (String chartKey : userByChartKey.keySet()) {
            chartKeyByUser.put(userByChartKey.get(chartKey).Id, chartKey);
        }
        Set<Id> activeIds = new Map<Id, User>(users).keySet();

        List<Member> result = new List<Member>();
        for (User u : users) {
            Org_Chart_Person__mdt entry = entryByKey.get(chartKeyByUser.get(u.Id));
            Member m = new Member();
            m.key = u.Id;
            m.userId = u.Id;
            m.chartKey = entry?.DeveloperName;
            m.name = u.Name;
            m.firstName = u.FirstName;
            m.lastName = u.LastName;
            m.title = String.isNotBlank(u.Title) ? u.Title : entry?.Title__c;
            m.department = String.isNotBlank(u.Department) ? u.Department : entry?.Department__c;
            m.email = u.Email;
            m.phone = u.Phone;
            m.mobile = u.MobilePhone;
            m.photoUrl = u.FullPhotoUrl;
            m.city = u.City;
            if (u.ManagerId != null && activeIds.contains(u.ManagerId)) {
                m.managerKey = u.ManagerId;
            } else if (entry != null) {
                m.managerKey = memberKey(entry.Reports_To__c, entryByKey, userByChartKey);
            }
            result.add(m);
        }

        for (Org_Chart_Person__mdt entry : chart) {
            if (userByChartKey.containsKey(entry.DeveloperName)) {
                continue;
            }
            Member m = new Member();
            m.key = PLACEHOLDER_PREFIX + entry.DeveloperName;
            m.chartKey = entry.DeveloperName;
            m.name = entry.MasterLabel;
            m.firstName = entry.First_Name__c;
            m.lastName = entry.Last_Name__c;
            m.title = entry.Title__c;
            m.department = entry.Department__c;
            m.managerKey = memberKey(entry.Reports_To__c, entryByKey, userByChartKey);
            m.isPlaceholder = true;
            result.add(m);
        }

        result.sort();
        return result;
    }

    private static String memberKey(String chartKey, Map<String, Org_Chart_Person__mdt> entryByKey, Map<String, User> userByChartKey) {
        if (String.isBlank(chartKey) || !entryByKey.containsKey(chartKey)) {
            return null;
        }
        User u = userByChartKey.get(chartKey);
        return u != null ? (String) u.Id : PLACEHOLDER_PREFIX + chartKey;
    }

    /** Same last name, and the user's first name matches the chart's first name or a listed nickname. */
    @TestVisible
    private static Boolean nameMatches(User u, Org_Chart_Person__mdt entry) {
        if (u.LastName == null || entry.Last_Name__c == null || !u.LastName.equalsIgnoreCase(entry.Last_Name__c)) {
            return false;
        }
        if (String.isBlank(u.FirstName)) {
            return false;
        }
        String first = u.FirstName.toLowerCase();
        List<String> options = new List<String>{ entry.First_Name__c };
        if (String.isNotBlank(entry.Other_First_Names__c)) {
            options.addAll(entry.Other_First_Names__c.split(','));
        }
        for (String option : options) {
            if (String.isBlank(option)) {
                continue;
            }
            String candidate = option.trim().toLowerCase();
            if (first.startsWith(candidate) || candidate.startsWith(first)) {
                return true;
            }
        }
        return false;
    }
}