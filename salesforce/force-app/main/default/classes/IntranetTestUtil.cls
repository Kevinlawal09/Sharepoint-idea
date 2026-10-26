/** Shared test setup. Controllers run in user mode, so tests act as staff with the Intranet_User permission set. */
@IsTest
public class IntranetTestUtil {

    public static User intranetUser(String lastName) {
        User me = [
            SELECT ProfileId, TimeZoneSidKey, LocaleSidKey, LanguageLocaleKey, EmailEncodingKey
            FROM User WHERE Id = :UserInfo.getUserId()
        ];
        User tester = new User(
            ProfileId = me.ProfileId,
            FirstName = 'Test',
            LastName = lastName,
            Alias = lastName.left(8),
            Email = 'intranet.tester@example.com',
            Username = 'intranet.' + lastName.deleteWhitespace().toLowerCase() + '.' + Math.abs(Crypto.getRandomInteger()) + '@example.com',
            Title = 'Tester',
            Department = 'Testing',
            TimeZoneSidKey = me.TimeZoneSidKey,
            LocaleSidKey = me.LocaleSidKey,
            LanguageLocaleKey = me.LanguageLocaleKey,
            EmailEncodingKey = me.EmailEncodingKey
        );
        insert tester;
        insert new PermissionSetAssignment(
            AssigneeId = tester.Id,
            PermissionSetId = [SELECT Id FROM PermissionSet WHERE Name = 'Intranet_User'].Id
        );
        return tester;
    }

    public static User intranetUser() {
        return intranetUser('Tester');
    }
}