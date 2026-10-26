/**
 * Backs the intranetCelebrations LWC on Intranet Home: today's birthdays, work anniversaries and
 * other celebrations (Intranet_Celebration__c), with how many coworkers signed each card.
 * Signing a card posts a Kudos to that person (IntranetController.postKudos), so wishes also
 * show on the Kudos wall; the count is today's kudos to them.
 */
public with sharing class CelebrationController {

    public class Celebration {
        @AuraEnabled public Id id;
        @AuraEnabled public Id personId;
        @AuraEnabled public String name;
        @AuraEnabled public String firstName;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public String type;
        @AuraEnabled public String headline;
        @AuraEnabled public Integer wishCount = 0;
        @AuraEnabled public Boolean signedByMe = false;
        @AuraEnabled public Boolean isMe = false;
    }

    @AuraEnabled
    public static List<Celebration> getTodaysCelebrations() {
        Id me = UserInfo.getUserId();
        List<Celebration> result = new List<Celebration>();
        Map<Id, List<Celebration>> byPerson = new Map<Id, List<Celebration>>();

        for (Intranet_Celebration__c row : [
            SELECT Id, Type__c, Headline__c, Person__c, Person__r.Name, Person__r.FirstName, Person__r.FullPhotoUrl
            FROM Intranet_Celebration__c
            WHERE Celebration_Date__c = TODAY AND Person__c != null AND Person__r.IsActive = true
            WITH USER_MODE
            ORDER BY Person__r.FirstName
            LIMIT 20
        ]) {
            Celebration item = new Celebration();
            item.id = row.Id;
            item.personId = row.Person__c;
            item.name = row.Person__r.Name;
            item.firstName = String.isBlank(row.Person__r.FirstName) ? row.Person__r.Name : row.Person__r.FirstName;
            item.photoUrl = row.Person__r.FullPhotoUrl;
            item.type = String.isBlank(row.Type__c) ? 'Birthday' : row.Type__c;
            item.headline = String.isNotBlank(row.Headline__c) ? row.Headline__c : standardHeadline(item.type, item.firstName);
            item.isMe = row.Person__c == me;
            result.add(item);
            if (!byPerson.containsKey(row.Person__c)) {
                byPerson.put(row.Person__c, new List<Celebration>());
            }
            byPerson.get(row.Person__c).add(item);
        }

        if (!byPerson.isEmpty()) {
            for (Kudos__c wish : [
                SELECT Recipient__c, CreatedById
                FROM Kudos__c
                WHERE Recipient__c IN :byPerson.keySet() AND CreatedDate = TODAY
                WITH USER_MODE
            ]) {
                for (Celebration item : byPerson.get(wish.Recipient__c)) {
                    item.wishCount++;
                    item.signedByMe = item.signedByMe || wish.CreatedById == me;
                }
            }
        }
        return result;
    }

    private static String standardHeadline(String type, String firstName) {
        if (type == 'Work Anniversary') {
            return 'Happy work anniversary, ' + firstName + '!';
        }
        if (type == 'Birthday') {
            return 'Happy birthday, ' + firstName + '!';
        }
        return 'Let\'s celebrate ' + firstName + '!';
    }
}
