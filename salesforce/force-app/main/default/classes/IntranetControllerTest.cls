@IsTest
private class IntranetControllerTest {

    private static User intranetUser() {
        return IntranetTestUtil.intranetUser();
    }

    @IsTest
    static void kudosCanBePostedAndStarToggles() {
        System.runAs(intranetUser()) {
            Id kudosId = IntranetController.postKudos('  Thanks for covering the front desk!  ', UserInfo.getUserId());

            Assert.isTrue(IntranetController.toggleStar(kudosId), 'First click should add a star');
            Assert.areEqual(1, [SELECT Star_Count__c FROM Kudos__c WHERE Id = :kudosId].Star_Count__c.intValue());

            Assert.isFalse(IntranetController.toggleStar(kudosId), 'Second click should remove the star');
            Assert.areEqual(0, [SELECT Star_Count__c FROM Kudos__c WHERE Id = :kudosId].Star_Count__c.intValue());

            List<Kudos__c> feed = IntranetController.getKudos();
            Assert.areEqual(1, feed.size());
            Assert.areEqual('Thanks for covering the front desk!', feed[0].Message__c, 'Message should be trimmed');
        }
    }

    @IsTest
    static void blankKudosIsRejected() {
        System.runAs(intranetUser()) {
            try {
                IntranetController.postKudos('   ', null);
                Assert.fail('Expected a blank message to be rejected');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('message'));
            }
        }
    }

    @IsTest
    static void ideasAllowOneVotePerPerson() {
        System.runAs(intranetUser()) {
            Id ideaId = IntranetController.submitIdea('Standing desks in the copy room', 'Would help afternoon focus.');
            IntranetController.vote(ideaId);

            try {
                IntranetController.vote(ideaId);
                Assert.fail('Expected a second vote to be rejected');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('already voted'));
            }

            List<Intranet_Idea__c> ideas = IntranetController.getIdeas();
            Assert.areEqual(1, ideas.size());
            Assert.areEqual('Under Review', ideas[0].Status__c, 'New ideas start under review');
            Assert.areEqual(1, ideas[0].Vote_Count__c.intValue());
            Assert.areEqual(1, ideas[0].Votes__r.size(), 'Current user vote should be returned');
        }
    }

    @IsTest
    static void ideaNeedsATitle() {
        System.runAs(intranetUser()) {
            try {
                IntranetController.submitIdea('', 'No title');
                Assert.fail('Expected an untitled idea to be rejected');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('title'));
            }
        }
    }

    @IsTest
    static void rsvpToggles() {
        System.runAs(intranetUser()) {
            // Events are created by admins; test DML runs in system mode, so insert them directly.
            Intranet_Event__c townHall = new Intranet_Event__c(Name = 'All-Staff Town Hall', Start__c = System.now().addDays(3));
            Intranet_Event__c pastEvent = new Intranet_Event__c(Name = 'Last Year Picnic', Start__c = System.now().addDays(-400));
            insert new List<Intranet_Event__c>{ townHall, pastEvent };

            Assert.isTrue(IntranetController.toggleRsvp(townHall.Id));
            List<Intranet_Event__c> upcoming = IntranetController.getEvents();
            Assert.areEqual(1, upcoming.size(), 'Past events should be hidden');
            Assert.areEqual(1, upcoming[0].RSVPs__r.size());

            Assert.isFalse(IntranetController.toggleRsvp(townHall.Id));
            Assert.areEqual(0, [SELECT RSVP_Count__c FROM Intranet_Event__c WHERE Id = :townHall.Id].RSVP_Count__c.intValue());
        }
    }
}