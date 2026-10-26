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

    @IsTest
    static void coworkersAreEmailedExceptPosterAndOptOuts() {
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
        Assert.isFalse(told.contains(poster.Id), 'The poster is not emailed about their own moment');
        Assert.isFalse(told.contains(optedOut.Id), 'People who opted out are skipped');
        Assert.isFalse(told.contains(departed.Id), 'Inactive users are skipped');

        Messaging.SingleEmailMessage message = MomentAlerts.sent[0];
        Assert.areEqual('Test Poster shared a LIVE UNITED Moment', message.getSubject());
        Assert.isTrue(message.getHtmlBody().contains('Beach &lt;cleanup&gt; day!'), 'Captions are escaped in the HTML email');
        Assert.isTrue(message.getPlainTextBody().contains('Email me about new moments'), 'Every email says how to opt out');
        Assert.isFalse(message.getSaveAsActivity());
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
