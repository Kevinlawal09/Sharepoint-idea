/**
 * Backs the employeeProfile LWC: one page per person with their details, reporting line,
 * kudos received and (via intranetStories) their stories. People on the org chart without
 * a Salesforce user get a placeholder page (see StaffRoster).
 */
public with sharing class ProfileController {

    public class PersonSummary {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String initials;
        @AuraEnabled public String title;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public Boolean isPlaceholder;
    }

    public class KudosItem {
        @AuraEnabled public String id;
        @AuraEnabled public String message;
        @AuraEnabled public String fromName;
        @AuraEnabled public Datetime createdDate;
    }

    public class Profile {
        @AuraEnabled public String id;
        @AuraEnabled public String userId;
        @AuraEnabled public String name;
        @AuraEnabled public String firstName;
        @AuraEnabled public String initials;
        @AuraEnabled public String title;
        @AuraEnabled public String department;
        @AuraEnabled public String email;
        @AuraEnabled public String phone;
        @AuraEnabled public String mobile;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public String aboutMe;
        @AuraEnabled public String askMeAbout;
        @AuraEnabled public Boolean isMe = false;
        @AuraEnabled public Boolean isPlaceholder = false;
        @AuraEnabled public PersonSummary manager;
        @AuraEnabled public List<PersonSummary> directReports = new List<PersonSummary>();
        @AuraEnabled public List<KudosItem> kudos = new List<KudosItem>();
    }

    /** A person's profile by User Id or placeholder key ("ph:..."). Blank means the current user. */
    @AuraEnabled(cacheable=true)
    public static Profile getProfile(String userId) {
        String key = String.isBlank(userId) ? (String) UserInfo.getUserId() : userId;
        if (!key.startsWith(StaffRoster.PLACEHOLDER_PREFIX) && key.length() == 15) {
            key = Id.valueOf(key);
        }

        Map<String, StaffRoster.Member> byKey = new Map<String, StaffRoster.Member>();
        for (StaffRoster.Member m : StaffRoster.members()) {
            byKey.put(m.key, m);
        }
        StaffRoster.Member member = byKey.get(key);
        if (member == null) {
            AuraHandledException e = new AuraHandledException('That person could not be found.');
            e.setMessage('That person could not be found.');
            throw e;
        }

        Profile p = new Profile();
        p.id = member.key;
        p.userId = member.userId;
        p.name = member.name;
        p.firstName = member.firstName;
        p.initials = member.initials();
        p.title = member.title;
        p.department = member.department;
        p.email = member.email;
        p.phone = member.phone;
        p.mobile = member.mobile;
        p.photoUrl = member.photoUrl;
        p.isPlaceholder = member.isPlaceholder;
        p.isMe = member.userId == UserInfo.getUserId();

        if (byKey.containsKey(member.managerKey)) {
            p.manager = summary(byKey.get(member.managerKey));
        }
        for (StaffRoster.Member other : byKey.values()) {
            if (other.managerKey == member.key) {
                p.directReports.add(summary(other));
            }
        }

        if (member.userId != null) {
            User u = [SELECT AboutMe, Ask_Me_About__c FROM User WHERE Id = :member.userId WITH USER_MODE];
            p.aboutMe = u.AboutMe;
            p.askMeAbout = u.Ask_Me_About__c;
            for (Kudos__c k : [
                SELECT Id, Message__c, CreatedBy.Name, CreatedDate
                FROM Kudos__c
                WHERE Recipient__c = :member.userId
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT 10
            ]) {
                KudosItem item = new KudosItem();
                item.id = k.Id;
                item.message = k.Message__c;
                item.fromName = k.CreatedBy.Name;
                item.createdDate = k.CreatedDate;
                p.kudos.add(item);
            }
        }
        return p;
    }

    /** People can only edit their own profile, and only these fields. */
    @AuraEnabled
    public static void updateMyProfile(String aboutMe, String askMeAbout, String phone, String mobile) {
        update new User(
            Id = UserInfo.getUserId(),
            AboutMe = clean(aboutMe, 1000),
            Ask_Me_About__c = clean(askMeAbout, 255),
            Phone = clean(phone, 40),
            MobilePhone = clean(mobile, 40)
        );
    }

    private static PersonSummary summary(StaffRoster.Member m) {
        PersonSummary s = new PersonSummary();
        s.id = m.key;
        s.name = m.name;
        s.initials = m.initials();
        s.title = m.title;
        s.photoUrl = m.photoUrl;
        s.isPlaceholder = m.isPlaceholder;
        return s;
    }

    private static String clean(String value, Integer maxLength) {
        return String.isBlank(value) ? null : value.trim().abbreviate(maxLength);
    }
}