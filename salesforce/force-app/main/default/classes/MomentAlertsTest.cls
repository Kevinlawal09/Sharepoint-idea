@IsTest
private class MomentAlertsTest {

    private static Id postMoment(String caption) {
        Id storyId = StoryController.createDraft();
        StoryController.publishCaptured(storyId, 'story-photo.jpg', EncodingUtil.base64Encode(Blob.valueOf('jpeg bytes')), caption);
        return storyId;
    }

    private static Set<Id> recipients() {
        Set<Id> ids = new Set<Id>();
        for (Messaging.SingleEmailMessage message : MomentAlerts.sent) {
            ids.add(message.getTargetObjectId());
        }
        return ids;
    }

    private static Messaging.SingleEmailMessage sentTo(Id userId) {
        for (Messaging.SingleEmailMessage message : MomentAlerts.sent) {
            if (message.getTargetObjectId() == userId) {
                return message;
            }
        }
        return null;
    }

    @IsTest
    static void coworkersAreEmailedAndPosterGetsConfirmation() {
        User poster = IntranetTestUtil.intranetUser('Poster');
        User coworker = IntranetTestUtil.intranetUser('Coworker');
        User optedOut = IntranetTestUtil.intranetUser('OptedOut');
        User departed = IntranetTestUtil.intranetUser('Departed');
        optedOut.Moments_Email_Opt_Out__c = true;
        departed.IsActive = false;
        update new List<User>{ optedOut, departed };

        Test.startTest();
        System.runAs(poster) {
            postMoment('Beach <cleanup> day!');
        }
        Test.stopTest();

        Set<Id> told = recipients();
        Assert.isTrue(told.contains(coworker.Id), 'Active coworkers get the email');
        Assert.isFalse(told.contains(optedOut.Id), 'People who opted out are skipped');
        Assert.isFalse(told.contains(departed.Id), 'Inactive users are skipped');

        Messaging.SingleEmailMessage alert = sentTo(coworker.Id);
        Assert.areEqual('Test Poster shared a LIVE UNITED Moment', alert.getSubject());
        Assert.isTrue(alert.getHtmlBody().contains('Beach &lt;cleanup&gt; day!'), 'Captions are escaped in the HTML email');
        Assert.isTrue(alert.getPlainTextBody().contains('Email me about new moments'), 'Every email says how to opt out');
        Assert.isFalse(alert.getSaveAsActivity());

        Messaging.SingleEmailMessage confirmation = sentTo(poster.Id);
        Assert.isNotNull(confirmation, 'The poster gets a confirmation');
        Assert.areEqual('Your LIVE UNITED Moment is live', confirmation.getSubject());
        Integer coworkersTold = MomentAlerts.sent.size() - 1;
        String expected = 'We let ' + coworkersTold + (coworkersTold == 1 ? ' coworker' : ' coworkers') + ' know by email.';
        Assert.isTrue(confirmation.getPlainTextBody().contains(expected), 'The confirmation counts everyone emailed: ' + confirmation.getPlainTextBody());
        Assert.isTrue(confirmation.getPlainTextBody().contains('washes away at'), 'The confirmation says when it expires');
    }

    @IsTest
    static void postersWhoOptedOutGetNoConfirmation() {
        User poster = IntranetTestUtil.intranetUser('Poster');
        User coworker = IntranetTestUtil.intranetUser('Coworker');
        poster.Moments_Email_Opt_Out__c = true;
        update poster;

        Test.startTest();
        System.runAs(poster) {
            postMoment(null);
        }
        Test.stopTest();

        Assert.isNull(sentTo(poster.Id), 'Opting out covers the confirmation too');
        Assert.isNotNull(sentTo(coworker.Id), 'Coworkers are still told');
    }

    @IsTest
    static void onlyTheFirstLiveMomentIsAnnounced() {
        User poster = IntranetTestUtil.intranetUser('Poster');
        IntranetTestUtil.intranetUser('Coworker');
        System.runAs(poster) {
            postMoment('First one'); // its alert job isn't run here
        }

        Test.startTest();
        System.runAs(poster) {
            postMoment('Second one');
        }
        Test.stopTest();

        Assert.isTrue(MomentAlerts.sent.isEmpty(), 'A second moment the same day does not email everyone again');
    }

    @IsTest
    static void deletedMomentsAreNotAnnounced() {
        User poster = IntranetTestUtil.intranetUser('Poster');
        IntranetTestUtil.intranetUser('Coworker');

        Test.startTest();
        System.runAs(poster) {
            Id storyId = postMoment(null);
            StoryController.deleteStory(storyId);
        }
        Test.stopTest();

        Assert.isTrue(MomentAlerts.sent.isEmpty());
    }

    @IsTest
    static void peopleCanTurnMomentEmailsOffAndOn() {
        System.runAs(IntranetTestUtil.intranetUser()) {
            Assert.isTrue(StoryController.getMomentEmails(), 'Emails are on by default');
            StoryController.setMomentEmails(false);
            Assert.isFalse(StoryController.getMomentEmails());
            Assert.isTrue([SELECT Moments_Email_Opt_Out__c FROM User WHERE Id = :UserInfo.getUserId()].Moments_Email_Opt_Out__c);
            StoryController.setMomentEmails(true);
            Assert.isTrue(StoryController.getMomentEmails());
        }
    }
}
