@IsTest
private class StaffRosterTest {

    private static Org_Chart_Person__mdt entry(String key, String label, String first, String others, String last, String title, String reportsTo) {
        return (Org_Chart_Person__mdt) JSON.deserialize(JSON.serialize(new Map<String, Object>{
            'DeveloperName' => key,
            'MasterLabel' => label,
            'First_Name__c' => first,
            'Other_First_Names__c' => others,
            'Last_Name__c' => last,
            'Title__c' => title,
            'Department__c' => 'Test Department',
            'Reports_To__c' => reportsTo
        }), Org_Chart_Person__mdt.class);
    }

    /** A placeholder boss (no user) with a real user reporting to them via the chart. */
    private static User setUpChart() {
        User charted = IntranetTestUtil.intranetUser('Charted');
        StaffRoster.chartOverride = new List<Org_Chart_Person__mdt>{
            entry('Pat_Boss', 'Pat Boss', 'Patricia', 'Pat', 'Boss', 'Chief Executive', null),
            entry('Test_Charted', 'Test Charted', 'Testy', 'Test', 'Charted', 'Chart Title', 'Pat_Boss')
        };
        return charted;
    }

    @IsTest
    static void chartPeopleWithoutUsersBecomePlaceholders() {
        User charted = setUpChart();

        System.runAs(charted) {
            Map<String, DirectoryController.Person> byId = new Map<String, DirectoryController.Person>();
            for (DirectoryController.Person p : DirectoryController.getStaff()) {
                byId.put(p.id, p);
            }

            DirectoryController.Person boss = byId.get('ph:Pat_Boss');
            Assert.isNotNull(boss, 'Chart person without a user should be a placeholder');
            Assert.isTrue(boss.isPlaceholder);
            Assert.areEqual('PB', boss.initials);
            Assert.areEqual('Chief Executive', boss.title);

            DirectoryController.Person user = byId.get(charted.Id);
            Assert.isFalse(user.isPlaceholder, 'Matched by nickname "Test", so shown as the real user');
            Assert.areEqual('ph:Pat_Boss', user.managerId, 'Reports to the placeholder through the chart');
            Assert.areEqual('Pat Boss', user.managerName);
            Assert.areEqual('Tester', user.title, 'User title wins over the chart when set');
        }
    }

    @IsTest
    static void placeholderProfileShowsTeam() {
        User charted = setUpChart();

        System.runAs(charted) {
            ProfileController.Profile boss = ProfileController.getProfile('ph:Pat_Boss');
            Assert.isTrue(boss.isPlaceholder);
            Assert.isFalse(boss.isMe);
            Assert.isNull(boss.userId);
            Assert.areEqual(1, boss.directReports.size());
            Assert.areEqual(charted.Id, boss.directReports[0].id);

            ProfileController.Profile mine = ProfileController.getProfile(null);
            Assert.areEqual('ph:Pat_Boss', mine.manager.id);
            Assert.isTrue(mine.manager.isPlaceholder);
        }
    }

    @IsTest
    static void ambiguousNamesStayPlaceholders() {
        IntranetTestUtil.intranetUser('Twin');
        IntranetTestUtil.intranetUser('Twin');
        StaffRoster.chartOverride = new List<Org_Chart_Person__mdt>{
            entry('Test_Twin', 'Test Twin', 'Test', null, 'Twin', 'Twin', null)
        };
        Map<String, User> matches = StaffRoster.matchUsers(
            StaffRoster.chart(),
            [SELECT Id, FirstName, LastName FROM User WHERE LastName = 'Twin']
        );
        Assert.isTrue(matches.isEmpty(), 'Two users with the same name should not be guessed');
    }
}