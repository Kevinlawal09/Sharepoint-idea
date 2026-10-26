@IsTest
private class StoryControllerTest {

    private static Id postStory(String caption, String fileName) {
        Id storyId = StoryController.createDraft();
        ContentVersion upload = new ContentVersion(
            Title = fileName,
            PathOnClient = fileName,
            VersionData = Blob.valueOf('not really media'),
            FirstPublishLocationId = storyId
        );
        insert upload;
        Id documentId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :upload.Id].ContentDocumentId;
        StoryController.publish(storyId, documentId, caption);
        return storyId;
    }

    @IsTest
    static void storyIsPostedViewedAndShowsSeenBy() {
        User poster = IntranetTestUtil.intranetUser('Poster');
        User viewer = IntranetTestUtil.intranetUser('Viewer');
        Id storyId;

        System.runAs(poster) {
            storyId = postStory('Volunteer day!', 'beach-cleanup.jpg');
        }

        Story__c saved = [SELECT Caption__c, Media_Type__c, Expires_At__c, Content_Version_Id__c FROM Story__c WHERE Id = :storyId];
        Assert.areEqual('Volunteer day!', saved.Caption__c);
        Assert.areEqual('Photo', saved.Media_Type__c);
        Assert.isTrue(saved.Expires_At__c > System.now().addHours(23), 'Story should last about 24 hours');
        Assert.isNotNull(saved.Content_Version_Id__c);

        System.runAs(viewer) {
            List<StoryController.AuthorStories> feed = StoryController.getActiveStories();
            Assert.areEqual(1, feed.size());
            Assert.isFalse(feed[0].isMe);
            Assert.isTrue(feed[0].hasUnseen, 'New story should be unseen');
            Assert.isTrue(feed[0].stories[0].mediaUrl.endsWith(saved.Content_Version_Id__c));
            Assert.isNull(feed[0].stories[0].viewCount, 'Viewers should not see view counts');

            StoryController.markViewed(storyId);
            StoryController.markViewed(storyId);
            Assert.isFalse(StoryController.getActiveStories()[0].hasUnseen);
        }

        System.runAs(poster) {
            List<StoryController.AuthorStories> feed = StoryController.getActiveStories();
            Assert.isTrue(feed[0].isMe);
            Assert.areEqual(1, feed[0].stories[0].viewCount, 'Repeat views count once');

            List<StoryController.Viewer> viewers = StoryController.getViewers(storyId);
            Assert.areEqual(1, viewers.size());
            Assert.areEqual('Test Viewer', viewers[0].name);
        }
    }

    @IsTest
    static void videosAreDetected() {
        System.runAs(IntranetTestUtil.intranetUser()) {
            Id storyId = postStory(null, 'town-hall.mp4');
            Assert.areEqual('Video', [SELECT Media_Type__c FROM Story__c WHERE Id = :storyId].Media_Type__c);
        }
    }

    @IsTest
    static void cameraCapturesArePosted() {
        System.runAs(IntranetTestUtil.intranetUser()) {
            Id storyId = StoryController.createDraft();
            StoryController.publishCaptured(storyId, 'story-photo.jpg', EncodingUtil.base64Encode(Blob.valueOf('jpeg bytes')), 'Hello from the camera');

            Story__c saved = [SELECT Caption__c, Media_Type__c, Expires_At__c FROM Story__c WHERE Id = :storyId];
            Assert.areEqual('Photo', saved.Media_Type__c);
            Assert.areEqual('Hello from the camera', saved.Caption__c);
            Assert.isNotNull(saved.Expires_At__c);

            Id videoId = StoryController.createDraft();
            String dataUrl = 'data:video/webm;codecs=vp8,opus;base64,' + EncodingUtil.base64Encode(Blob.valueOf('webm bytes'));
            StoryController.publishCaptured(videoId, 'story-video.webm', dataUrl, null);
            Assert.areEqual('Video', [SELECT Media_Type__c FROM Story__c WHERE Id = :videoId].Media_Type__c, 'Video data URLs with codec details should post');

            try {
                StoryController.publishCaptured(StoryController.createDraft(), 'story-photo.jpg', '', null);
                Assert.fail('Expected an empty capture to be rejected');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('Nothing was captured'));
            }
        }
    }

    @IsTest
    static void unsupportedFileIsRejectedAndRemoved() {
        System.runAs(IntranetTestUtil.intranetUser()) {
            try {
                postStory('Notes', 'notes.txt');
                Assert.fail('Expected a text file to be rejected');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('photos'));
            }
            Assert.areEqual(0, [SELECT COUNT() FROM ContentDocument WHERE Title = 'notes.txt']);
        }
    }

    @IsTest
    static void onlyThePosterCanSeeViewersOrDelete() {
        User poster = IntranetTestUtil.intranetUser('Poster');
        User other = IntranetTestUtil.intranetUser('Other');
        Id storyId;
        System.runAs(poster) {
            storyId = postStory('Mine', 'me.png');
        }

        System.runAs(other) {
            try {
                StoryController.getViewers(storyId);
                Assert.fail('Expected viewers to be private to the poster');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('own moments'));
            }
            try {
                StoryController.deleteStory(storyId);
                Assert.fail('Expected delete to be limited to the poster');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('own moments'));
            }
        }

        System.runAs(poster) {
            StoryController.deleteStory(storyId);
        }
        Assert.areEqual(0, [SELECT COUNT() FROM Story__c]);
        Assert.areEqual(0, [SELECT COUNT() FROM ContentDocument WHERE Title = 'me.png'], 'Media should be deleted with the story');
    }

    @IsTest
    static void coworkersCanLikeAndUnlikeMoments() {
        User poster = IntranetTestUtil.intranetUser('Poster');
        User fan = IntranetTestUtil.intranetUser('Fan');
        User other = IntranetTestUtil.intranetUser('Other');
        Id storyId;
        System.runAs(poster) {
            storyId = postStory('Volunteer day!', 'beach-cleanup.jpg');
        }

        System.runAs(fan) {
            StoryController.markViewed(storyId);
            StoryController.LikeResult liked = StoryController.toggleLike(storyId);
            Assert.isTrue(liked.liked);
            Assert.areEqual(1, liked.likeCount);
        }
        System.runAs(other) {
            StoryController.markViewed(storyId);
            Assert.areEqual(2, StoryController.toggleLike(storyId).likeCount);
            StoryController.LikeResult unliked = StoryController.toggleLike(storyId);
            Assert.isFalse(unliked.liked, 'A second tap unlikes');
            Assert.areEqual(1, unliked.likeCount);

            StoryController.StoryItem seen = StoryController.getActiveStories()[0].stories[0];
            Assert.areEqual(1, seen.likeCount, 'Everyone sees the like count');
            Assert.isFalse(seen.liked);
        }
        System.runAs(fan) {
            Assert.isTrue(StoryController.getActiveStories()[0].stories[0].liked, 'Your own like shows as liked');
        }

        System.runAs(poster) {
            try {
                StoryController.toggleLike(storyId);
                Assert.fail('Expected posters not to like their own moments');
            } catch (AuraHandledException e) {
                Assert.isTrue(e.getMessage().contains('your own'));
            }
            Map<String, Boolean> likedByName = new Map<String, Boolean>();
            for (StoryController.Viewer viewer : StoryController.getViewers(storyId)) {
                likedByName.put(viewer.name, viewer.liked);
            }
            Assert.isTrue(likedByName.get('Test Fan'), 'The poster sees who liked it');
            Assert.isFalse(likedByName.get('Test Other'));

            StoryController.deleteStory(storyId);
        }
        Assert.areEqual(0, [SELECT COUNT() FROM Story_Like__c], 'Likes are deleted with the moment');
    }

    @IsTest
    static void draftsCanBeDiscardedAndAreHidden() {
        System.runAs(IntranetTestUtil.intranetUser()) {
            Id draftId = StoryController.createDraft();
            Assert.isTrue(StoryController.getActiveStories().isEmpty(), 'Drafts are never shown');
            StoryController.discardDraft(draftId);
        }
        Assert.areEqual(0, [SELECT COUNT() FROM Story__c]);
    }

    @IsTest
    static void cleanupRemovesExpiredStories() {
        Story__c expired = new Story__c(Caption__c = 'Old', Expires_At__c = System.now().addHours(-1));
        Story__c live = new Story__c(Caption__c = 'New', Expires_At__c = System.now().addHours(5));
        insert new List<Story__c>{ expired, live };

        Test.startTest();
        new StoryCleanupJob().execute(null);
        Test.stopTest();

        Assert.areEqual(0, [SELECT COUNT() FROM Story__c WHERE Id = :expired.Id], 'Expired story should be removed');
        Assert.areEqual(1, [SELECT COUNT() FROM Story__c WHERE Id = :live.Id], 'Live story should stay');
        Assert.isNotNull(System.schedule('Story cleanup test', '0 0 * * * ?', new StoryCleanupJob()));
    }
}