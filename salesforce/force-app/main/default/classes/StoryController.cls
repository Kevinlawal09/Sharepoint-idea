/**
 * Backs the intranetStories LWC: 24-hour photo and video stories with a seen-by list.
 *
 * Posting is two steps because lightning-file-upload needs a record to attach to:
 *   1. createDraft() makes a Story__c with no Expires_At__c (drafts are never shown).
 *   2. The file uploads straight to Salesforce Files, then publish() validates it and
 *      starts the 24-hour clock.
 * StoryCleanup deletes expired stories, abandoned drafts and their files.
 */
public with sharing class StoryController {

    public static final Integer STORY_HOURS = 24;
    @TestVisible
    private static final Long MAX_BYTES = 50 * 1024 * 1024;
    private static final Set<String> PHOTO_TYPES = new Set<String>{ 'jpg', 'jpeg', 'png', 'gif', 'webp' };
    private static final Set<String> VIDEO_TYPES = new Set<String>{ 'mp4', 'mov', 'webm', 'm4v' };
    private static final String DOWNLOAD_URL = '/sfc/servlet.shepherd/version/download/';

    public class StoryItem {
        @AuraEnabled public String id;
        @AuraEnabled public String caption;
        @AuraEnabled public String mediaType;
        @AuraEnabled public String mediaUrl;
        @AuraEnabled public Datetime createdDate;
        @AuraEnabled public Boolean seen;
        @AuraEnabled public Integer viewCount;
        @AuraEnabled public Integer likeCount;
        @AuraEnabled public Boolean liked;
    }

    public class LikeResult {
        @AuraEnabled public Boolean liked;
        @AuraEnabled public Integer likeCount;
    }

    public class AuthorStories implements Comparable {
        @AuraEnabled public String authorId;
        @AuraEnabled public String authorName;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public Boolean isMe = false;
        @AuraEnabled public Boolean hasUnseen = false;
        @AuraEnabled public Datetime latest;
        @AuraEnabled public List<StoryItem> stories = new List<StoryItem>();

        // Your own ring first, then people with unseen stories, then most recent.
        public Integer compareTo(Object other) {
            AuthorStories that = (AuthorStories) other;
            if (isMe != that.isMe) {
                return isMe ? -1 : 1;
            }
            if (hasUnseen != that.hasUnseen) {
                return hasUnseen ? -1 : 1;
            }
            if (latest == that.latest) {
                return 0;
            }
            return latest > that.latest ? -1 : 1;
        }
    }

    public class Viewer {
        @AuraEnabled public String name;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public Datetime viewedAt;
        @AuraEnabled public Boolean liked;
    }

    @AuraEnabled(cacheable=true)
    public static List<AuthorStories> getActiveStories() {
        Id me = UserInfo.getUserId();
        Datetime now = System.now();
        List<Story__c> rows = [
            SELECT Id, Caption__c, Media_Type__c, Content_Version_Id__c, CreatedDate,
                CreatedById, CreatedBy.Name, CreatedBy.SmallPhotoUrl,
                (SELECT Id FROM Views__r WHERE CreatedById = :me),
                (SELECT Id FROM Likes__r WHERE CreatedById = :me)
            FROM Story__c
            WHERE Expires_At__c > :now
            WITH USER_MODE
            ORDER BY CreatedDate ASC
            LIMIT 500
        ];

        Set<Id> myStoryIds = new Set<Id>();
        Set<Id> allStoryIds = new Set<Id>();
        for (Story__c row : rows) {
            allStoryIds.add(row.Id);
            if (row.CreatedById == me) {
                myStoryIds.add(row.Id);
            }
        }
        Map<Id, Integer> viewCounts = StoryViewerAccess.countViews(myStoryIds);
        Map<Id, Integer> likeCounts = StoryViewerAccess.countLikes(allStoryIds);

        Map<Id, AuthorStories> byAuthor = new Map<Id, AuthorStories>();
        for (Story__c row : rows) {
            AuthorStories author = byAuthor.get(row.CreatedById);
            if (author == null) {
                author = new AuthorStories();
                author.authorId = row.CreatedById;
                author.authorName = row.CreatedBy.Name;
                author.photoUrl = row.CreatedBy.SmallPhotoUrl;
                author.isMe = row.CreatedById == me;
                byAuthor.put(row.CreatedById, author);
            }

            StoryItem story = new StoryItem();
            story.id = row.Id;
            story.caption = row.Caption__c;
            story.mediaType = row.Media_Type__c;
            story.mediaUrl = DOWNLOAD_URL + row.Content_Version_Id__c;
            story.createdDate = row.CreatedDate;
            story.seen = author.isMe || !row.Views__r.isEmpty();
            story.viewCount = author.isMe ? viewCounts.get(row.Id) : null;
            story.likeCount = likeCounts.get(row.Id);
            story.liked = !row.Likes__r.isEmpty();

            author.stories.add(story);
            author.latest = row.CreatedDate;
            author.hasUnseen = author.hasUnseen || !story.seen;
        }

        List<AuthorStories> result = byAuthor.values();
        result.sort();
        return result;
    }

    @AuraEnabled
    public static Id createDraft() {
        Story__c draft = new Story__c();
        Database.insert(draft, AccessLevel.USER_MODE);
        return draft.Id;
    }

    /** Validates the uploaded file, saves the caption and starts the 24-hour clock. */
    @AuraEnabled
    public static void publish(Id storyId, Id contentDocumentId, String caption) {
        Story__c story = ownStory(storyId);
        List<ContentVersion> versions = [
            SELECT Id, FileExtension, ContentSize
            FROM ContentVersion
            WHERE ContentDocumentId = :contentDocumentId AND IsLatest = true
            WITH USER_MODE
        ];
        if (versions.isEmpty()) {
            throw newError('The upload could not be found. Try again.');
        }

        ContentVersion version = versions[0];
        String extension = version.FileExtension == null ? '' : version.FileExtension.toLowerCase();
        String mediaType = PHOTO_TYPES.contains(extension) ? 'Photo' : VIDEO_TYPES.contains(extension) ? 'Video' : null;

        if (mediaType == null || version.ContentSize > MAX_BYTES) {
            StoryCleanup.deleteFiles(new Set<Id>{ contentDocumentId });
            throw newError(mediaType == null
                ? 'Moments support photos (JPG, PNG, GIF, WebP) and videos (MP4, MOV, WebM).'
                : 'That file is too large. Keep moments under 50 MB (about 30 seconds of video).');
        }

        // System mode on purpose: people can't set their own expiry or media fields directly.
        story.Caption__c = String.isBlank(caption) ? null : caption.trim().abbreviate(255);
        story.Media_Type__c = mediaType;
        story.Content_Document_Id__c = contentDocumentId;
        story.Content_Version_Id__c = version.Id;
        story.Expires_At__c = System.now().addHours(STORY_HOURS);
        update story;

        // Email coworkers in the background so posting stays fast.
        System.enqueueJob(new MomentAlerts(story.Id));
    }

    /**
     * Posts a photo or short video captured with the in-app camera. The browser sends it as
     * base64, so captures are kept small (the LWC caps video at 15 seconds).
     */
    @AuraEnabled
    public static void publishCaptured(Id storyId, String fileName, String base64Data, String caption) {
        ownStory(storyId);
        if (String.isBlank(base64Data) || String.isBlank(fileName)) {
            throw newError('Nothing was captured. Try again.');
        }
        // Accept a full data URL too ("data:video/webm;codecs=vp8,opus;base64,...").
        String data = base64Data.contains('base64,') ? base64Data.substringAfterLast('base64,') : base64Data;
        ContentVersion capture = new ContentVersion(
            Title = fileName,
            PathOnClient = fileName,
            VersionData = EncodingUtil.base64Decode(data),
            FirstPublishLocationId = storyId
        );
        insert capture;
        Id documentId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :capture.Id].ContentDocumentId;
        publish(storyId, documentId, caption);
    }

    /** Cancels an unpublished draft and any file already uploaded to it. */
    @AuraEnabled
    public static void discardDraft(Id storyId) {
        ownStory(storyId);
        StoryCleanup.purge(new Set<Id>{ storyId });
    }

    @AuraEnabled
    public static void deleteStory(Id storyId) {
        ownStory(storyId);
        StoryCleanup.purge(new Set<Id>{ storyId });
    }

    /** Records that the current user saw a story. Your own stories don't count. */
    @AuraEnabled
    public static void markViewed(Id storyId) {
        Id me = UserInfo.getUserId();
        List<Story__c> stories = [SELECT CreatedById FROM Story__c WHERE Id = :storyId WITH USER_MODE];
        if (stories.isEmpty() || stories[0].CreatedById == me) {
            return;
        }
        String key = String.valueOf(storyId) + ':' + me;
        if (![SELECT Id FROM Story_View__c WHERE Unique_Key__c = :key WITH USER_MODE].isEmpty()) {
            return;
        }
        try {
            Database.insert(new Story_View__c(Story__c = storyId, Unique_Key__c = key), AccessLevel.USER_MODE);
        } catch (DmlException e) {
            // A double tap can race the unique key; the view is already recorded.
            if (e.getDmlType(0) != StatusCode.DUPLICATE_VALUE) {
                throw e;
            }
        }
    }

    /** Likes or unlikes a coworker's moment for the current user. You can't like your own. */
    @AuraEnabled
    public static LikeResult toggleLike(Id storyId) {
        Id me = UserInfo.getUserId();
        List<Story__c> stories = [
            SELECT CreatedById, Expires_At__c FROM Story__c WHERE Id = :storyId WITH USER_MODE
        ];
        if (stories.isEmpty() || stories[0].Expires_At__c == null || stories[0].Expires_At__c <= System.now()) {
            throw newError('This moment has washed away.');
        }
        if (stories[0].CreatedById == me) {
            throw newError('You can\'t like your own moment.');
        }

        String key = String.valueOf(storyId) + ':' + me;
        List<Story_Like__c> mine = [SELECT Id FROM Story_Like__c WHERE Unique_Key__c = :key WITH USER_MODE];
        if (mine.isEmpty()) {
            try {
                Database.insert(new Story_Like__c(Story__c = storyId, Unique_Key__c = key), AccessLevel.USER_MODE);
            } catch (DmlException e) {
                // A double tap can race the unique key; the like is already recorded.
                if (e.getDmlType(0) != StatusCode.DUPLICATE_VALUE) {
                    throw e;
                }
            }
        } else {
            Database.delete(mine, AccessLevel.USER_MODE);
        }

        LikeResult result = new LikeResult();
        result.liked = mine.isEmpty();
        result.likeCount = StoryViewerAccess.countLikes(new Set<Id>{ storyId }).get(storyId);
        return result;
    }

    /** Who saw your story. Only the person who posted it can ask. */
    @AuraEnabled
    public static List<Viewer> getViewers(Id storyId) {
        ownStory(storyId);
        return StoryViewerAccess.viewersOf(storyId);
    }

    /** Whether the current user gets an email when a coworker shares a moment. */
    @AuraEnabled
    public static Boolean getMomentEmails() {
        return ![SELECT Moments_Email_Opt_Out__c FROM User WHERE Id = :UserInfo.getUserId()].Moments_Email_Opt_Out__c;
    }

    @AuraEnabled
    public static void setMomentEmails(Boolean enabled) {
        // System mode on purpose: staff can't edit User fields directly, and this only touches their own record.
        update new User(Id = UserInfo.getUserId(), Moments_Email_Opt_Out__c = enabled != true);
    }

    private static Story__c ownStory(Id storyId) {
        List<Story__c> stories = [
            SELECT Id, CreatedById FROM Story__c WHERE Id = :storyId WITH USER_MODE
        ];
        if (stories.isEmpty() || stories[0].CreatedById != UserInfo.getUserId()) {
            throw newError('You can only change your own moments.');
        }
        return stories[0];
    }

    private static AuraHandledException newError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }
}