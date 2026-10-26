@IsTest
private class CelebrationControllerTest {

    @IsTest
    static void todaysCelebrationShowsWithSignatures() {
        User birthdayPerson = IntranetTestUtil.intranetUser('Birthday');
        User coworker = IntranetTestUtil.intranetUser('Coworker');
        User other = IntranetTestUtil.intranetUser('Other');
        insert new List<Intranet_Celebration__c>{
            new Intranet_Celebration__c(Person__c = birthdayPerson.Id, Celebration_Date__c = Date.today(), Type__c = 'Birthday'),
            new Intranet_Celebration__c(Person__c = other.Id, Celebration_Date__c = Date.today().addDays(1), Type__c = 'Birthday')
        };

        System.runAs(coworker) {
            List<CelebrationController.Celebration> today = CelebrationController.getTodaysCelebrations();
            Assert.areEqual(1, today.size(), 'Only today\'s celebrations show');
            Assert.areEqual('Happy birthday, Test!', today[0].headline);
            Assert.areEqual(0, today[0].wishCount);
            Assert.isFalse(today[0].isMe);

            IntranetController.postKudos('Happy birthday!', birthdayPerson.Id);
            CelebrationController.Celebration signed = CelebrationController.getTodaysCelebrations()[0];
            Assert.areEqual(1, signed.wishCount, 'Signing the card counts as a wish');
            Assert.isTrue(signed.signedByMe);
        }

        System.runAs(birthdayPerson) {
            CelebrationController.Celebration mine = CelebrationController.getTodaysCelebrations()[0];
            Assert.isTrue(mine.isMe, 'The person sees their own card');
            Assert.areEqual(1, mine.wishCount);
            Assert.isFalse(mine.signedByMe);
        }
    }

    @IsTest
    static void headlinesFollowTheType() {
        User person = IntranetTestUtil.intranetUser('Person');
        insert new List<Intranet_Celebration__c>{
            new Intranet_Celebration__c(Person__c = person.Id, Celebration_Date__c = Date.today(), Type__c = 'Work Anniversary'),
            new Intranet_Celebration__c(Person__c = person.Id, Celebration_Date__c = Date.today(), Type__c = 'Other', Headline__c = 'Congrats on the new role!')
        };

        System.runAs(IntranetTestUtil.intranetUser('Viewer')) {
            Set<String> headlines = new Set<String>();
            for (CelebrationController.Celebration item : CelebrationController.getTodaysCelebrations()) {
                headlines.add(item.headline);
            }
            Assert.isTrue(headlines.contains('Happy work anniversary, Test!'));
            Assert.isTrue(headlines.contains('Congrats on the new role!'), 'A custom headline replaces the standard one');
        }
    }
}
