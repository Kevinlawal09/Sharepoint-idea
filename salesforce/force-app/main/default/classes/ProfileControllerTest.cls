@IsTest
private class ProfileControllerTest {

    @IsTest
    static void profileShowsReportingLineAndKudos() {
        User manager = IntranetTestUtil.intranetUser('Manager');
        User report = IntranetTestUtil.intranetUser('Report');
        update new User(Id = report.Id, ManagerId = manager.Id);

        System.runAs(manager) {
            IntranetController.postKudos('Great work on the campaign deck', report.Id);
        }

        System.runAs(report) {
            ProfileController.Profile mine = ProfileController.getProfile(null);
            Assert.areEqual(report.Id, mine.id, 'Blank id should load my own profile');
            Assert.isTrue(mine.isMe);
            Assert.areEqual(manager.Id, mine.manager.id);
            Assert.areEqual(1, mine.kudos.size());
            Assert.areEqual('Test Manager', mine.kudos[0].fromName);

            ProfileController.Profile boss = ProfileController.getProfile(manager.Id);
            Assert.isFalse(boss.isMe);
            Assert.areEqual(1, boss.directReports.size());
            Assert.areEqual(report.Id, boss.directReports[0].id);
        }
    }

    @IsTest
    static void peopleCanEditTheirOwnProfile() {
        User me = IntranetTestUtil.intranetUser('Editor');
        System.runAs(me) {
            ProfileController.updateMyProfile('  I run the VITA sites.  ', 'VITA, taxes, pickleball', '561-555-0100', '');
        }
        User saved = [SELECT AboutMe, Ask_Me_About__c, Phone, MobilePhone FROM User WHERE Id = :me.Id];
        Assert.areEqual('I run the VITA sites.', saved.AboutMe);
        Assert.areEqual('VITA, taxes, pickleball', saved.Ask_Me_About__c);
        Assert.areEqual('561-555-0100', saved.Phone);
        Assert.isNull(saved.MobilePhone);
    }

    @IsTest
    static void unknownPersonGivesFriendlyError() {
        System.runAs(IntranetTestUtil.intranetUser()) {
            try {
                ProfileController.getProfile('005000000000001');
                Assert.fail('Expected an error for a missing user');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('could not be found'));
            }
        }
    }
}