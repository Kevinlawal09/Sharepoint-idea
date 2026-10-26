/**
 * Backs the intranet LWCs: kudos wall, idea exchange, and events.
 * Replaces the /api/kudos, /api/ideas and /api/events endpoints from the
 * Sharepoint-idea Node prototype. "Once per person" rules are enforced by a
 * unique key (ParentId:UserId) on each child record, not by trusting a name.
 */
public with sharing class IntranetController {

    // ---------------------------------------------------------------- Kudos

    @AuraEnabled(cacheable=true)
    public static List<Kudos__c> getKudos() {
        Id me = UserInfo.getUserId();
        return [
            SELECT Id, Message__c, Star_Count__c, CreatedDate,
                CreatedBy.Name, Recipient__r.Name,
                (SELECT Id FROM Stars__r WHERE CreatedById = :me)
            FROM Kudos__c
            WITH USER_MODE
            ORDER BY CreatedDate DESC
            LIMIT 50
        ];
    }

    @AuraEnabled
    public static Id postKudos(String message, Id recipientId) {
        if (String.isBlank(message)) {
            throw newError('Write a message before posting.');
        }
        Kudos__c kudos = new Kudos__c(Message__c = message.trim(), Recipient__c = recipientId);
        Database.insert(kudos, AccessLevel.USER_MODE);
        return kudos.Id;
    }

    /** Stars a post, or removes the star if the current user already gave one. Returns the new state. */
    @AuraEnabled
    public static Boolean toggleStar(Id kudosId) {
        String key = uniqueKey(kudosId);
        List<Kudos_Star__c> existing = [
            SELECT Id FROM Kudos_Star__c WHERE Unique_Key__c = :key WITH USER_MODE
        ];
        if (!existing.isEmpty()) {
            Database.delete(existing, AccessLevel.USER_MODE);
            return false;
        }
        Database.insert(new Kudos_Star__c(Kudos__c = kudosId, Unique_Key__c = key), AccessLevel.USER_MODE);
        return true;
    }

    // ---------------------------------------------------------------- Ideas

    @AuraEnabled(cacheable=true)
    public static List<Intranet_Idea__c> getIdeas() {
        Id me = UserInfo.getUserId();
        return [
            SELECT Id, Name, Description__c, Status__c, Vote_Count__c, CreatedDate,
                CreatedBy.Name,
                (SELECT Id FROM Votes__r WHERE CreatedById = :me)
            FROM Intranet_Idea__c
            WITH USER_MODE
            ORDER BY Vote_Count__c DESC, CreatedDate DESC
            LIMIT 100
        ];
    }

    @AuraEnabled
    public static Id submitIdea(String title, String description) {
        if (String.isBlank(title)) {
            throw newError('Give your idea a title.');
        }
        Intranet_Idea__c idea = new Intranet_Idea__c(
            Name = title.trim().abbreviate(80),
            Description__c = description == null ? null : description.trim()
        );
        Database.insert(idea, AccessLevel.USER_MODE);
        return idea.Id;
    }

    /** One vote per person per idea, matching the prototype. */
    @AuraEnabled
    public static void vote(Id ideaId) {
        String key = uniqueKey(ideaId);
        Boolean alreadyVoted = ![
            SELECT Id FROM Idea_Vote__c WHERE Unique_Key__c = :key WITH USER_MODE
        ].isEmpty();
        if (alreadyVoted) {
            throw newError('You already voted for this idea.');
        }
        try {
            Database.insert(new Idea_Vote__c(Idea__c = ideaId, Unique_Key__c = key), AccessLevel.USER_MODE);
        } catch (DmlException e) {
            // Two clicks racing each other hit the unique key; treat it the same as a repeat vote.
            if (e.getDmlType(0) == StatusCode.DUPLICATE_VALUE) {
                throw newError('You already voted for this idea.');
            }
            throw e;
        }
    }

    // --------------------------------------------------------------- Events

    @AuraEnabled(cacheable=true)
    public static List<Intranet_Event__c> getEvents() {
        Id me = UserInfo.getUserId();
        return [
            SELECT Id, Name, Start__c, Location__c, Details__c, RSVP_Count__c,
                (SELECT Id FROM RSVPs__r WHERE CreatedById = :me)
            FROM Intranet_Event__c
            WHERE Start__c >= TODAY
            WITH USER_MODE
            ORDER BY Start__c ASC
            LIMIT 50
        ];
    }

    /** RSVPs, or cancels the RSVP if the current user already has one. Returns the new state. */
    @AuraEnabled
    public static Boolean toggleRsvp(Id eventId) {
        String key = uniqueKey(eventId);
        List<Event_RSVP__c> existing = [
            SELECT Id FROM Event_RSVP__c WHERE Unique_Key__c = :key WITH USER_MODE
        ];
        if (!existing.isEmpty()) {
            Database.delete(existing, AccessLevel.USER_MODE);
            return false;
        }
        Database.insert(new Event_RSVP__c(Event__c = eventId, Unique_Key__c = key), AccessLevel.USER_MODE);
        return true;
    }

    // -------------------------------------------------------------- Helpers

    private static String uniqueKey(Id parentId) {
        return String.valueOf(parentId) + ':' + UserInfo.getUserId();
    }

    private static AuraHandledException newError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }
}