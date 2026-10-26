import { LightningElement, api, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import LightningConfirm from 'lightning/confirm';
import CURRENT_USER_ID from '@salesforce/user/Id';
import getActiveStories from '@salesforce/apex/StoryController.getActiveStories';
import createDraft from '@salesforce/apex/StoryController.createDraft';
import publish from '@salesforce/apex/StoryController.publish';
import discardDraft from '@salesforce/apex/StoryController.discardDraft';
import deleteStory from '@salesforce/apex/StoryController.deleteStory';
import markViewed from '@salesforce/apex/StoryController.markViewed';
import getViewers from '@salesforce/apex/StoryController.getViewers';
import publishCaptured from '@salesforce/apex/StoryController.publishCaptured';
import getMomentEmails from '@salesforce/apex/StoryController.getMomentEmails';
import setMomentEmails from '@salesforce/apex/StoryController.setMomentEmails';
import { errorMessage, showToast, timeAgo } from 'c/intranetUtils';

const PHOTO_MS = 5000;
const TICK_MS = 50;
// Camera captures go to Apex as base64, so keep them small.
const MAX_RECORD_SECONDS = 15;
const VIDEO_BITS_PER_SECOND = 600000;
const MAX_PHOTO_EDGE = 1280;
const MAX_BASE64_LENGTH = 3500000;
const ACCEPTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.m4v'];

/**
 * LIVE UNITED Moments (Snapchat-style stories, stored as Story__c): a ring per coworker,
 * a full-screen viewer that auto-advances, and a seen-by list on your own moments. Media lives in Salesforce Files and is
 * deleted by StoryCleanup when the story expires.
 */
export default class IntranetStories extends LightningElement {
    /** Show only this person's stories (used on profile pages). Blank shows everyone. */
    @api userId;

    acceptedFormats = ACCEPTED_FORMATS;
    allAuthors = [];
    error;
    wiredStories;

    // Composer
    isComposerOpen = false;
    isCreatingDraft = false;
    isPublishing = false;
    draftId;
    caption = '';

    // In-app camera
    isCameraOpen = false;
    isCameraStarting = false;
    isRecording = false;
    recordSecondsLeft = MAX_RECORD_SECONDS;
    facingMode = 'user';
    capture;
    stream;
    recorder;
    recordTimer;

    // Viewer. `viewing` is a snapshot so a refresh can't reshuffle stories mid-view.
    isViewerOpen = false;
    viewing = [];
    authorIndex = 0;
    storyIndex = 0;
    progress = 0;
    muted = true;
    timer;
    focusViewer = false;

    // Seen-by sheet
    isViewersOpen = false;
    isViewersLoading = false;
    viewers = [];

    // Email alerts (MomentAlerts). Hidden until loaded so the toggle never flips on its own.
    emailsOn = true;
    isEmailPrefLoaded = false;

    connectedCallback() {
        if (!this.userId) {
            getMomentEmails()
                .then((enabled) => {
                    this.emailsOn = enabled;
                    this.isEmailPrefLoaded = true;
                })
                .catch(() => {
                    // Without the preference the toggle just stays hidden.
                });
        }
    }

    @wire(getActiveStories)
    handleStories(result) {
        this.wiredStories = result;
        if (result.data) {
            this.allAuthors = result.data.map((author) => {
                const count = author.stories.length;
                return {
                    ...author,
                    label: author.isMe ? 'Your moments' : author.authorName.split(' ')[0],
                    ringClass: `ring ${author.hasUnseen ? 'ring_unseen' : 'ring_seen'}`,
                    ariaLabel: `${author.isMe ? 'Your moments' : author.authorName}: ${count} ${count === 1 ? 'moment' : 'moments'}${author.hasUnseen ? ', new' : ''}`
                };
            });
            this.error = undefined;
        } else if (result.error) {
            this.error = errorMessage(result.error);
        }
    }

    renderedCallback() {
        if (this.focusViewer && this.refs.viewer) {
            this.refs.viewer.focus();
            this.focusViewer = false;
        }
        const preview = this.refs.preview;
        if (preview && this.stream && preview.srcObject !== this.stream) {
            preview.srcObject = this.stream;
        }
    }

    disconnectedCallback() {
        this.stopTimer();
        this.stopCamera();
    }

    get authors() {
        return this.userId ? this.allAuthors.filter((author) => author.authorId === this.userId) : this.allAuthors;
    }

    get isOwnProfile() {
        return this.userId === CURRENT_USER_ID;
    }

    get showAddStory() {
        return !this.userId || this.isOwnProfile;
    }

    get subtitle() {
        return this.userId ? 'Moments wash away after 24 hours.' : 'Share your day with the team. Moments wash away after 24 hours.';
    }

    get emptyMessage() {
        if (!this.userId) {
            return 'No moments yet today. Be the first to share one.';
        }
        return this.isOwnProfile ? 'You haven\'t shared a moment today.' : 'No moments in the last 24 hours.';
    }

    get isEmpty() {
        return !this.error && this.authors.length === 0;
    }

    get showEmailToggle() {
        return !this.userId && this.isEmailPrefLoaded;
    }

    async handleEmailToggle(event) {
        const enabled = event.target.checked;
        try {
            await setMomentEmails({ enabled });
            this.emailsOn = enabled;
            showToast(
                this,
                enabled ? 'Moment emails on' : 'Moment emails off',
                enabled ? 'You\'ll get an email when a coworker shares a moment.' : 'You won\'t get emails about new moments. Turn this back on anytime.'
            );
        } catch (e) {
            event.target.checked = !enabled;
            showToast(this, 'Could not save your choice', errorMessage(e), 'error');
        }
    }

    // ------------------------------------------------------------- Composer

    async openComposer() {
        this.isCreatingDraft = true;
        try {
            this.draftId = await createDraft();
            this.caption = '';
            this.isComposerOpen = true;
        } catch (e) {
            showToast(this, 'Could not start a moment', errorMessage(e), 'error');
        } finally {
            this.isCreatingDraft = false;
        }
    }

    handleCaption(event) {
        this.caption = event.detail.value || '';
    }

    async handleUploadFinished(event) {
        const [file] = event.detail.files;
        await this.publishWith(() =>
            publish({ storyId: this.draftId, contentDocumentId: file.documentId, caption: this.caption })
        );
    }

    async publishWith(send) {
        this.isPublishing = true;
        try {
            await send();
            this.stopCamera();
            this.isComposerOpen = false;
            this.draftId = undefined;
            showToast(this, 'Moment shared', 'Your coworkers can see it for the next 24 hours.');
            await refreshApex(this.wiredStories);
        } catch (e) {
            // A rejected file is removed server-side; the draft stays so they can try again.
            showToast(this, 'Could not share moment', errorMessage(e), 'error');
        } finally {
            this.isPublishing = false;
        }
    }

    // --------------------------------------------------------------- Camera

    get canRecord() {
        return typeof MediaRecorder !== 'undefined';
    }

    async openCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            showToast(this, 'Camera not available', 'This browser can\'t use the camera here. Use the upload button instead.', 'warning');
            return;
        }
        this.isCameraOpen = true;
        this.capture = undefined;
        await this.startStream();
    }

    async startStream() {
        this.isCameraStarting = true;
        this.stopStream();
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: this.canRecord
            });
        } catch (e) {
            this.isCameraOpen = false;
            const blocked = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
            showToast(
                this,
                blocked ? 'Camera access is blocked' : 'Could not start the camera',
                blocked
                    ? 'Allow camera access for Salesforce in your browser. If it stays blocked, a Salesforce admin needs to allow the camera in Setup (Session Settings).'
                    : errorMessage(e),
                'error'
            );
        } finally {
            this.isCameraStarting = false;
        }
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        await this.startStream();
    }

    takePhoto() {
        const video = this.refs.preview;
        if (!video?.videoWidth) {
            return;
        }
        const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        this.capture = { isPhoto: true, dataUrl: canvas.toDataURL('image/jpeg', 0.85), fileName: 'story-photo.jpg' };
        this.stopStream();
    }

    startRecording() {
        const mimeType = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
        const chunks = [];
        const startedAt = Date.now();
        this.recorder = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
        this.recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
        };
        this.recorder.onstop = () => {
            // Drop codec details ("video/webm;codecs=vp8,opus" -> "video/webm").
            const type = (this.recorder.mimeType || mimeType || 'video/webm').split(';')[0];
            const blob = new Blob(chunks, { type });
            this.capture = {
                isPhoto: false,
                blob,
                previewUrl: URL.createObjectURL(blob),
                previewFallback: 'dataUrl',
                fileName: type.includes('mp4') ? 'story-video.mp4' : 'story-video.webm',
                seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000))
            };
            this.isRecording = false;
            this.stopStream();
        };
        this.recorder.start();
        this.isRecording = true;
        this.recordSecondsLeft = MAX_RECORD_SECONDS;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.recordTimer = setInterval(() => {
            this.recordSecondsLeft--;
            if (this.recordSecondsLeft <= 0) {
                this.stopRecording();
            }
        }, 1000);
    }

    stopRecording() {
        clearInterval(this.recordTimer);
        this.recordTimer = undefined;
        if (this.recorder?.state === 'recording') {
            this.recorder.stop();
        }
    }

    /**
     * Some Salesforce security settings block blob: media. Retry the preview as a data: URL,
     * and if that is blocked too, fall back to the "Video recorded" card. Posting still works.
     */
    async handlePreviewError() {
        if (!this.capture || this.capture.isPhoto) {
            return;
        }
        this.revokePreview();
        if (this.capture.previewFallback === 'dataUrl') {
            const base64 = await blobToBase64(this.capture.blob);
            this.capture = { ...this.capture, previewUrl: `data:${this.capture.blob.type};base64,${base64}`, previewFallback: 'none' };
        } else {
            this.capture = { ...this.capture, previewUrl: undefined };
        }
    }

    revokePreview() {
        if (this.capture?.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(this.capture.previewUrl);
        }
    }

    async retake() {
        this.revokePreview();
        this.capture = undefined;
        await this.startStream();
    }

    async postCapture() {
        const base64Data = this.capture.isPhoto
            ? this.capture.dataUrl.split(',')[1]
            : await blobToBase64(this.capture.blob);
        if (base64Data.length > MAX_BASE64_LENGTH) {
            showToast(this, 'That video is too large', 'Try a shorter clip, or use the upload button for longer videos.', 'warning');
            return;
        }
        await this.publishWith(() =>
            publishCaptured({ storyId: this.draftId, fileName: this.capture.fileName, base64Data, caption: this.caption })
        );
    }

    closeCamera() {
        this.stopCamera();
    }

    stopCamera() {
        this.stopRecording();
        this.stopStream();
        this.revokePreview();
        this.isCameraOpen = false;
        this.isRecording = false;
        this.capture = undefined;
    }

    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = undefined;
        }
    }

    async cancelComposer() {
        const draftId = this.draftId;
        this.stopCamera();
        this.isComposerOpen = false;
        this.draftId = undefined;
        try {
            await discardDraft({ storyId: draftId });
        } catch (e) {
            // Abandoned drafts are also removed by StoryCleanup, so this can fail quietly.
        }
    }

    // --------------------------------------------------------------- Viewer

    get currentAuthor() {
        return this.viewing[this.authorIndex];
    }

    get currentStory() {
        return this.currentAuthor?.stories[this.storyIndex];
    }

    get currentIsPhoto() {
        return this.currentStory?.mediaType === 'Photo';
    }

    get currentIsVideo() {
        return this.currentStory?.mediaType === 'Video';
    }

    get currentWhen() {
        return timeAgo(this.currentStory?.createdDate);
    }

    get currentAlt() {
        return this.currentStory?.caption || `Moment from ${this.currentAuthor?.authorName}`;
    }

    get viewerLabel() {
        return `LIVE UNITED Moments from ${this.currentAuthor?.authorName}`;
    }

    get segments() {
        return this.currentAuthor.stories.map((story, index) => {
            let fill = 0;
            if (index < this.storyIndex) fill = 100;
            if (index === this.storyIndex) fill = Math.round(this.progress * 1000) / 10;
            return { key: story.id, style: `width: ${fill}%` };
        });
    }

    get seenByLabel() {
        const count = this.currentStory?.viewCount || 0;
        return `Seen by ${count}`;
    }

    get muteLabel() {
        return this.muted ? 'Unmute video' : 'Mute video';
    }

    get muteIcon() {
        return this.muted ? 'utility:muted' : 'utility:volume_high';
    }

    get noViewers() {
        return this.viewers.length === 0;
    }

    openViewer(event) {
        this.viewing = this.authors;
        this.authorIndex = Number(event.currentTarget.dataset.index);
        this.storyIndex = this.firstUnseenIndex(this.currentAuthor);
        this.isViewerOpen = true;
        this.focusViewer = true;
        this.startStory();
    }

    async closeViewer() {
        this.stopTimer();
        this.isViewerOpen = false;
        this.isViewersOpen = false;
        await refreshApex(this.wiredStories);
    }

    next() {
        if (this.storyIndex < this.currentAuthor.stories.length - 1) {
            this.storyIndex++;
        } else if (this.authorIndex < this.viewing.length - 1) {
            this.authorIndex++;
            this.storyIndex = this.firstUnseenIndex(this.currentAuthor);
        } else {
            this.closeViewer();
            return;
        }
        this.startStory();
    }

    previous() {
        if (this.storyIndex > 0) {
            this.storyIndex--;
        } else if (this.authorIndex > 0) {
            this.authorIndex--;
            this.storyIndex = this.currentAuthor.stories.length - 1;
        }
        this.startStory();
    }

    handleViewerKey(event) {
        if (event.key === 'Escape') {
            if (this.isViewersOpen) {
                this.closeViewers();
            } else {
                this.closeViewer();
            }
        } else if (event.key === 'ArrowRight') {
            this.next();
        } else if (event.key === 'ArrowLeft') {
            this.previous();
        }
    }

    handleTimeUpdate(event) {
        const video = event.target;
        if (video.duration) {
            this.progress = video.currentTime / video.duration;
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.refs.video) {
            this.refs.video.muted = this.muted;
        }
    }

    startStory() {
        this.stopTimer();
        this.progress = 0;
        const story = this.currentStory;
        if (!story) {
            return;
        }
        if (!story.seen) {
            markViewed({ storyId: story.id }).catch(() => {
                // A missed view only affects the seen-by count; don't interrupt viewing.
            });
        }
        if (story.mediaType === 'Photo') {
            this.startPhotoTimer();
        }
    }

    startPhotoTimer() {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.timer = setInterval(() => {
            if (this.isViewersOpen) {
                return;
            }
            this.progress = Math.min(1, this.progress + TICK_MS / PHOTO_MS);
            if (this.progress >= 1) {
                this.next();
            }
        }, TICK_MS);
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    firstUnseenIndex(author) {
        const index = author.stories.findIndex((story) => !story.seen);
        return index === -1 ? 0 : index;
    }

    // ------------------------------------------------------ Owner controls

    async openViewers() {
        this.isViewersOpen = true;
        this.isViewersLoading = true;
        this.refs.video?.pause();
        try {
            const viewers = await getViewers({ storyId: this.currentStory.id });
            this.viewers = viewers.map((person, index) => ({
                ...person,
                key: `${index}-${person.name}`,
                when: timeAgo(person.viewedAt)
            }));
        } catch (e) {
            this.viewers = [];
            showToast(this, 'Could not load viewers', errorMessage(e), 'error');
        } finally {
            this.isViewersLoading = false;
        }
    }

    closeViewers() {
        this.isViewersOpen = false;
        this.refs.video?.play();
    }

    async deleteCurrent() {
        this.stopTimer();
        this.refs.video?.pause();
        const confirmed = await LightningConfirm.open({
            label: 'Delete this moment?',
            message: 'It will be removed for everyone right away.',
            theme: 'error'
        });
        if (!confirmed) {
            if (this.currentIsPhoto) {
                this.startPhotoTimer();
            } else {
                this.refs.video?.play();
            }
            return;
        }
        try {
            await deleteStory({ storyId: this.currentStory.id });
            showToast(this, 'Moment deleted', '');
        } catch (e) {
            showToast(this, 'Could not delete moment', errorMessage(e), 'error');
        }
        await this.closeViewer();
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        // A data URL is "data:<type>;base64,<data>". The type can itself contain commas
        // (e.g. "video/webm;codecs=vp8,opus"), so take everything after the last comma.
        reader.onload = () => {
            const dataUrl = String(reader.result);
            resolve(dataUrl.substring(dataUrl.lastIndexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}