/**
 * Story_View__c and Story_Like__c are private to each person. These reads run without sharing
 * so a poster can see who viewed and liked their story, and everyone can see like counts.
 * Only StoryController calls them; views and the liked-by list only after checking the caller
 * owns the stories involved.
 */
public without sharing class StoryViewerAccess {

    public static Map<Id, Integer> countViews(Set<Id> storyIds) {
        Map<Id, Integer> counts = new Map<Id, Integer>();
        for (Id storyId : storyIds) {
            counts.put(storyId, 0);
        }
        if (storyIds.isEmpty()) {
            return counts;
        }
        for (AggregateResult row : [
            SELECT Story__c storyId, COUNT(Id) total
            FROM Story_View__c
            WHERE Story__c IN :storyIds
            GROUP BY Story__c
        ]) {
            counts.put((Id) row.get('storyId'), (Integer) row.get('total'));
        }
        return counts;
    }

    /** Like counts are public: everyone viewing a moment sees how many people liked it. */
    public static Map<Id, Integer> countLikes(Set<Id> storyIds) {
        Map<Id, Integer> counts = new Map<Id, Integer>();
        for (Id storyId : storyIds) {
            counts.put(storyId, 0);
        }
        if (storyIds.isEmpty()) {
            return counts;
        }
        for (AggregateResult row : [
            SELECT Story__c storyId, COUNT(Id) total
            FROM Story_Like__c
            WHERE Story__c IN :storyIds
            GROUP BY Story__c
        ]) {
            counts.put((Id) row.get('storyId'), (Integer) row.get('total'));
        }
        return counts;
    }

    public static List<StoryController.Viewer> viewersOf(Id storyId) {
        Set<Id> likers = new Set<Id>();
        for (Story_Like__c item : [SELECT CreatedById FROM Story_Like__c WHERE Story__c = :storyId]) {
            likers.add(item.CreatedById);
        }
        List<StoryController.Viewer> viewers = new List<StoryController.Viewer>();
        for (Story_View__c view : [
            SELECT CreatedDate, CreatedById, CreatedBy.Name, CreatedBy.SmallPhotoUrl
            FROM Story_View__c
            WHERE Story__c = :storyId
            ORDER BY CreatedDate DESC
            LIMIT 1000
        ]) {
            StoryController.Viewer viewer = new StoryController.Viewer();
            viewer.name = view.CreatedBy.Name;
            viewer.photoUrl = view.CreatedBy.SmallPhotoUrl;
            viewer.viewedAt = view.CreatedDate;
            viewer.liked = likers.contains(view.CreatedById);
            viewers.add(viewer);
        }
        return viewers;
    }
}