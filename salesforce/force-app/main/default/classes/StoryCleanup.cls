/**
 * Deletes expired stories, drafts abandoned for more than a day, their view and like rows and
 * their files, so story media doesn't pile up in Salesforce file storage.
 *
 * Scheduled hourly through StoryCleanupJob (see scripts/apex/schedule-story-cleanup.apex).
 *
 * Runs without sharing because it removes everyone's expired stories. StoryController
 * only calls purge() after checking the caller owns the story.
 */
public without sharing class StoryCleanup implements Callable {

    private static final Integer BATCH_SIZE = 200;

    /** Entry point for StoryCleanupJob, which calls in by name so this class stays deployable. */
    public Object call(String action, Map<String, Object> args) {
        return run();
    }

    public static Integer run() {
        Datetime now = System.now();
        Datetime draftCutoff = now.addDays(-1);
        Map<Id, Story__c> stale = new Map<Id, Story__c>([
            SELECT Id
            FROM Story__c
            WHERE Expires_At__c <= :now
                OR (Expires_At__c = null AND CreatedDate < :draftCutoff)
            LIMIT :BATCH_SIZE
        ]);
        purge(stale.keySet());
        return stale.size();
    }

    public static void purge(Set<Id> storyIds) {
        if (storyIds.isEmpty()) {
            return;
        }
        Set<Id> documentIds = new Set<Id>();
        for (ContentDocumentLink link : [
            SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId IN :storyIds
        ]) {
            documentIds.add(link.ContentDocumentId);
        }
        deleteFiles(documentIds);
        delete [SELECT Id FROM Story_View__c WHERE Story__c IN :storyIds];
        delete [SELECT Id FROM Story_Like__c WHERE Story__c IN :storyIds];
        delete [SELECT Id FROM Story__c WHERE Id IN :storyIds];
    }

    public static void deleteFiles(Set<Id> documentIds) {
        if (documentIds.isEmpty()) {
            return;
        }
        delete [SELECT Id FROM ContentDocument WHERE Id IN :documentIds];
    }
}