/**
 * Emails intranet users when a coworker shares a LIVE UNITED Moment, and sends the poster a
 * confirmation saying how many people were told. StoryController.publish() queues it so
 * posting stays fast.
 *
 * One round of emails per poster per day: if they already have a live moment, coworkers heard
 * about it from that one and nobody gets another. People turn these emails off (both kinds)
 * with the toggle on the Moments card (User.Moments_Email_Opt_Out__c).
 *
 * Without sharing on purpose: the poster can't see every User record, but everyone gets told.
 * Emails go to users by targetObjectId, so they don't count against the daily email limit.
 */
public without sharing class MomentAlerts implements Queueable {

    // Salesforce allows 10 sendEmail calls per transaction; a bigger org chains another job.
    private static final Integer PER_CALL = 100;
    private static final Integer CALLS_PER_JOB = 10;

    @TestVisible
    private static List<Messaging.SingleEmailMessage> sent = new List<Messaging.SingleEmailMessage>();

    private final Id storyId;
    private final Id afterUserId;

    public MomentAlerts(Id storyId) {
        this(storyId, null);
    }

    private MomentAlerts(Id storyId, Id afterUserId) {
        this.storyId = storyId;
        this.afterUserId = afterUserId;
    }

    public void execute(QueueableContext context) {
        List<Story__c> stories = [
            SELECT Id, Caption__c, Media_Type__c, Expires_At__c, CreatedById, CreatedBy.Name,
                CreatedBy.TimeZoneSidKey, CreatedBy.Moments_Email_Opt_Out__c
            FROM Story__c
            WHERE Id = :storyId
        ];
        // Deleted (or already expired) before this ran: nothing to announce.
        if (stories.isEmpty() || stories[0].Expires_At__c == null || stories[0].Expires_At__c <= System.now()) {
            return;
        }
        Story__c story = stories[0];
        if (afterUserId == null && alreadyAnnounced(story)) {
            return;
        }

        Integer jobSize = PER_CALL * CALLS_PER_JOB - 1; // leaves room for the poster's confirmation
        List<User> recipients = recipients(story.CreatedById, jobSize + 1);
        Boolean more = recipients.size() > jobSize;
        if (more) {
            recipients.remove(jobSize);
        }

        List<Messaging.SingleEmailMessage> batch = new List<Messaging.SingleEmailMessage>();
        // The first job confirms to the poster; it counts everyone, including later chained jobs.
        if (afterUserId == null && !story.CreatedBy.Moments_Email_Opt_Out__c) {
            batch.add(confirmation(story, more ? countRecipients(story.CreatedById) : recipients.size()));
        }
        for (User person : recipients) {
            batch.add(email(story, person.Id));
            if (batch.size() == PER_CALL) {
                send(batch);
                batch = new List<Messaging.SingleEmailMessage>();
            }
        }
        if (!batch.isEmpty()) {
            send(batch);
        }

        // Tests can't chain queueables; the batching above is what they cover.
        if (more && !Test.isRunningTest()) {
            System.enqueueJob(new MomentAlerts(storyId, recipients[recipients.size() - 1].Id));
        }
    }

    /** True when the poster already has another live moment, so coworkers were already emailed. */
    private static Boolean alreadyAnnounced(Story__c story) {
        return ![
            SELECT Id FROM Story__c
            WHERE CreatedById = :story.CreatedById AND Id != :story.Id AND Expires_At__c > :System.now()
            LIMIT 1
        ].isEmpty();
    }

    // Only people who can open the intranet are emailed, so nobody gets a link they can't use.
    // Giving someone one of these permission sets opts them in.
    private static final Set<String> ACCESS_SETS = new Set<String>{ 'Intranet_User', 'Intranet_Admin' };

    private List<User> recipients(Id posterId, Integer max) {
        if (afterUserId == null) {
            return [
                SELECT Id FROM User
                WHERE IsActive = true AND Moments_Email_Opt_Out__c = false AND Email != null AND Id != :posterId
                    AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.Name IN :ACCESS_SETS)
                ORDER BY Id
                LIMIT :max
            ];
        }
        return [
            SELECT Id FROM User
            WHERE IsActive = true AND Moments_Email_Opt_Out__c = false AND Email != null AND Id != :posterId
                AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.Name IN :ACCESS_SETS)
                AND Id > :afterUserId
            ORDER BY Id
            LIMIT :max
        ];
    }

    private static Integer countRecipients(Id posterId) {
        return [
            SELECT COUNT() FROM User
            WHERE IsActive = true AND Moments_Email_Opt_Out__c = false AND Email != null AND Id != :posterId
                AND Id IN (SELECT AssigneeId FROM PermissionSetAssignment WHERE PermissionSet.Name IN :ACCESS_SETS)
        ];
    }

    private static final String INTRANET_PATH = '/lightning/n/Intranet_Home';
    private static final String OPT_OUT = 'To stop these emails, open LIVE UNITED Moments on the intranet home page and turn off "Email me about new moments".';

    /** "Your moment is live": how many coworkers were told, and when it washes away. */
    private static Messaging.SingleEmailMessage confirmation(Story__c story, Integer told) {
        String kind = story.Media_Type__c == 'Video' ? 'video' : 'photo';
        String link = URL.getOrgDomainUrl().toExternalForm() + INTRANET_PATH;
        // In the poster's own time zone, e.g. "3:45 PM tomorrow".
        String until = story.Expires_At__c.format('h:mm a', story.CreatedBy.TimeZoneSidKey) + ' tomorrow';
        String reach = told == 0
            ? 'No one was emailed this time, because everyone else has turned off moment emails. Coworkers can still see it on the intranet.'
            : 'We let ' + told + (told == 1 ? ' coworker' : ' coworkers') + ' know by email.';

        Messaging.SingleEmailMessage message = base(story.CreatedById);
        message.setSubject('Your LIVE UNITED Moment is live');
        message.setHtmlBody(
            '<p>Thanks for sharing! Your ' + kind + ' is up on LIVE UNITED Moments.</p>' +
            (String.isBlank(story.Caption__c) ? '' : '<p style="font-size:16px">&ldquo;' + story.Caption__c.escapeHtml4() + '&rdquo;</p>') +
            '<p>' + reach.escapeHtml4() + '</p>' +
            '<p>It washes away at ' + until + '. Any other moments you share before then join this one, without another email to everyone.</p>' +
            '<p><a href="' + link + '">Open the intranet</a> to see who&rsquo;s viewed it.</p>' +
            '<hr><p style="color:#666;font-size:12px">' + OPT_OUT.escapeHtml4() + '</p>'
        );
        message.setPlainTextBody(
            'Thanks for sharing! Your ' + kind + ' is up on LIVE UNITED Moments.\n\n' +
            (String.isBlank(story.Caption__c) ? '' : '"' + story.Caption__c + '"\n\n') +
            reach + '\n\n' +
            'It washes away at ' + until + '. Any other moments you share before then join this one, without another email to everyone.\n\n' +
            'See who\'s viewed it: ' + link + '\n\n---\n' + OPT_OUT
        );
        return message;
    }

    // Setup > Organization-Wide Addresses: a verified address with this display name becomes the
    // sender. Without one, emails come from the poster's own address.
    private static final String SENDER_NAME = 'LIVE UNITED Moments';
    private static Id senderId;
    private static Boolean senderLooked = false;

    private static Id orgWideSender() {
        if (!senderLooked) {
            senderLooked = true;
            List<OrgWideEmailAddress> senders = [
                SELECT Id FROM OrgWideEmailAddress WHERE DisplayName = :SENDER_NAME LIMIT 1
            ];
            senderId = senders.isEmpty() ? null : senders[0].Id;
        }
        return senderId;
    }

    private static Messaging.SingleEmailMessage base(Id recipientId) {
        Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
        message.setTargetObjectId(recipientId);
        message.setSaveAsActivity(false);
        // Salesforce allows a shared sender or a display name, not both.
        Id sender = orgWideSender();
        if (sender != null) {
            message.setOrgWideEmailAddressId(sender);
        } else {
            message.setSenderDisplayName(SENDER_NAME);
        }
        return message;
    }

    private static Messaging.SingleEmailMessage email(Story__c story, Id recipientId) {
        String name = story.CreatedBy.Name;
        String kind = story.Media_Type__c == 'Video' ? 'video' : 'photo';
        String link = URL.getOrgDomainUrl().toExternalForm() + INTRANET_PATH;

        Messaging.SingleEmailMessage message = base(recipientId);
        message.setSubject(name + ' shared a LIVE UNITED Moment');
        message.setHtmlBody(
            '<p><b>' + name.escapeHtml4() + '</b> just shared a ' + kind + ' on LIVE UNITED Moments.</p>' +
            (String.isBlank(story.Caption__c) ? '' : '<p style="font-size:16px">&ldquo;' + story.Caption__c.escapeHtml4() + '&rdquo;</p>') +
            '<p><a href="' + link + '">See it on the UWPBC Intranet</a> before it washes away in 24 hours.</p>' +
            '<hr><p style="color:#666;font-size:12px">' + OPT_OUT.escapeHtml4() + '</p>'
        );
        message.setPlainTextBody(
            name + ' just shared a ' + kind + ' on LIVE UNITED Moments.\n\n' +
            (String.isBlank(story.Caption__c) ? '' : '"' + story.Caption__c + '"\n\n') +
            'See it before it washes away in 24 hours: ' + link + '\n\n---\n' + OPT_OUT
        );
        return message;
    }

    private static void send(List<Messaging.SingleEmailMessage> batch) {
        sent.addAll(batch);
        // Tests check what would be sent; sending for real fails in orgs with email turned off.
        if (!Test.isRunningTest()) {
            Messaging.sendEmail(batch, false);
        }
    }
}
