@IsTest
private class DirectoryControllerTest {

    @IsTest
    static void activeStaffAreListedWithDetails() {
        User colleague = IntranetTestUtil.intranetUser('Directory');

        System.runAs(colleague) {
            Map<String, DirectoryController.Person> byId = new Map<String, DirectoryController.Person>();
            for (DirectoryController.Person p : DirectoryController.getStaff()) {
                byId.put(p.id, p);
            }

            DirectoryController.Person me = byId.get(colleague.Id);
            Assert.isNotNull(me, 'Active staff should appear in the directory');
            Assert.areEqual('Test Directory', me.name);
            Assert.areEqual('Tester', me.title);
            Assert.areEqual('Testing', me.department);
            Assert.areEqual('intranet.tester@example.com', me.email);
            Assert.isNotNull(me.photoUrl);
        }
    }
}