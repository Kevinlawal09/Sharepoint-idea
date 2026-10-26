/**
 * Emails active staff when a coworker shares a LIVE UNITED Moment. StoryController.publish()
 * queues it so posting stays fast.
 *
 * One email per poster per day: if they already have a live moment, coworkers heard about it
 * from that one and don't get another. People turn these emails off with the toggle on the
 * Moments card (User.Moments_Email_Opt_Out__c).
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
            SELECT Id, Caption__c, Media_Type__c, Expires_At__c, CreatedById, CreatedBy.Name
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

        Integer jobSize = PER_CALL * CALLS_PER_JOB;
        List<User> recipients = recipients(story.CreatedById, jobSize + 1);
        Boolean more = recipients.size() > jobSize;
        if (more) {
            recipients.remove(jobSize);
        }

        List<Messaging.SingleEmailMessage> batch = new List<Messaging.SingleEmailMessage>();
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

    private List<User> recipients(Id posterId, Integer max) {
        if (afterUserId == null) {
            return [
                SELECT Id FROM User
                WHERE IsActive = true AND UserType = 'Standard' AND Moments_Email_Opt_Out__c = false
                    AND Email != null AND Id != :posterId
                ORDER BY Id
                LIMIT :max
            ];
        }
        return [
            SELECT Id FROM User
            WHERE IsActive = true AND UserType = 'Standard' AND Moments_Email_Opt_Out__c = false
                AND Email != null AND Id != :posterId AND Id > :afterUserId
            ORDER BY Id
            LIMIT :max
        ];
    }

    private static Messaging.SingleEmailMessage email(Story__c story, Id recipientId) {
        String name = story.CreatedBy.Name;
        String kind = story.Media_Type__c == 'Video' ? 'video' : 'photo';
        String link = URL.getOrgDomainUrl().toExternalForm() + '/lightning/n/Intranet_Home';
        String optOut = 'To stop these emails, open LIVE UNITED Moments on the intranet home page and turn off "Email me about new moments".';

        Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
        message.setTargetObjectId(recipientId);
        message.setSaveAsActivity(false);
        message.setSenderDisplayName('LIVE UNITED Moments');
        message.setSubject(name + ' shared a LIVE UNITED Moment');
        message.setHtmlBody(
            '<p><b>' + name.escapeHtml4() + '</b> just shared a ' + kind + ' on LIVE UNITED Moments.</p>' +
            (String.isBlank(story.Caption__c) ? '' : '<p style="font-size:16px">&ldquo;' + story.Caption__c.escapeHtml4() + '&rdquo;</p>') +
            '<p><a href="' + link + '">See it on the UWPBC Intranet</a> before it washes away in 24 hours.</p>' +
            '<hr><p style="color:#666;font-size:12px">' + optOut.escapeHtml4() + '</p>'
        );
        message.setPlainTextBody(
            name + ' just shared a ' + kind + ' on LIVE UNITED Moments.\n\n' +
            (String.isBlank(story.Caption__c) ? '' : '"' + story.Caption__c + '"\n\n') +
            'See it before it washes away in 24 hours: ' + link + '\n\n---\n' + optOut
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
