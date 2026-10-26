/**
 * Story_View__c is private to each viewer. These reads run without sharing so a poster can
 * see who viewed their story. Only StoryController calls them, and only after checking the
 * caller owns the stories involved.
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

    public static List<StoryController.Viewer> viewersOf(Id storyId) {
        List<StoryController.Viewer> viewers = new List<StoryController.Viewer>();
        for (Story_View__c view : [
            SELECT CreatedDate, CreatedBy.Name, CreatedBy.SmallPhotoUrl
            FROM Story_View__c
            WHERE Story__c = :storyId
            ORDER BY CreatedDate DESC
            LIMIT 1000
        ]) {
            StoryController.Viewer viewer = new StoryController.Viewer();
            viewer.name = view.CreatedBy.Name;
            viewer.photoUrl = view.CreatedBy.SmallPhotoUrl;
            viewer.viewedAt = view.CreatedDate;
            viewers.add(viewer);
        }
        return viewers;
    }
}