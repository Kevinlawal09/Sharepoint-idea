/**
 * Staff directory for the staffDirectory LWC. Everyone on the org chart appears, as their
 * Salesforce user when they have one and as a placeholder until they do (see StaffRoster).
 */
public with sharing class DirectoryController {

    public class Person {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String initials;
        @AuraEnabled public String title;
        @AuraEnabled public String department;
        @AuraEnabled public String email;
        @AuraEnabled public String phone;
        @AuraEnabled public String mobile;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public String managerId;
        @AuraEnabled public String managerName;
        @AuraEnabled public String city;
        @AuraEnabled public Boolean isPlaceholder;
    }

    /** All staff, A to Z by last name. id is a User Id, or "ph:<name>" for placeholders. */
    @AuraEnabled(cacheable=true)
    public static List<Person> getStaff() {
        List<StaffRoster.Member> members = StaffRoster.members();
        Map<String, StaffRoster.Member> byKey = new Map<String, StaffRoster.Member>();
        for (StaffRoster.Member m : members) {
            byKey.put(m.key, m);
        }

        List<Person> people = new List<Person>();
        for (StaffRoster.Member m : members) {
            Person p = new Person();
            p.id = m.key;
            p.name = m.name;
            p.initials = m.initials();
            p.title = m.title;
            p.department = m.department;
            p.email = m.email;
            p.phone = m.phone;
            p.mobile = m.mobile;
            p.photoUrl = m.photoUrl;
            p.managerId = m.managerKey;
            p.managerName = byKey.containsKey(m.managerKey) ? byKey.get(m.managerKey).name : null;
            p.city = m.city;
            p.isPlaceholder = m.isPlaceholder;
            people.add(p);
        }
        return people;
    }
}