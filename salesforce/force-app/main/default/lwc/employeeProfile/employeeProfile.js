import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { CurrentPageReference, NavigationMixin } from 'lightning/navigation';
import getProfile from '@salesforce/apex/ProfileController.getProfile';
import updateMyProfile from '@salesforce/apex/ProfileController.updateMyProfile';
import { errorMessage, showToast, timeAgo } from 'c/intranetUtils';

/**
 * A person's intranet page. Opened from the Staff tab with ?c__userId=...;
 * with no id it shows your own profile.
 */
export default class EmployeeProfile extends NavigationMixin(LightningElement) {
    userId = null;
    profile;
    error;
    wiredProfile;

    isEditing = false;
    isSaving = false;
    draft = {};

    @wire(CurrentPageReference)
    handlePageReference(pageRef) {
        this.userId = pageRef?.state?.c__userId || null;
    }

    @wire(getProfile, { userId: '$userId' })
    handleProfile(result) {
        this.wiredProfile = result;
        if (result.data) {
            this.profile = result.data;
            this.error = undefined;
        } else if (result.error) {
            this.profile = undefined;
            this.error = errorMessage(result.error);
        }
    }

    get mailto() {
        return `mailto:${this.profile.email}`;
    }

    get teamsChat() {
        return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(this.profile.email)}`;
    }

    get tel() {
        return `tel:${this.profile.phone.replace(/[^\d+]/g, '')}`;
    }

    get mobileTel() {
        return `tel:${this.profile.mobile.replace(/[^\d+]/g, '')}`;
    }

    get topics() {
        return (this.profile.askMeAbout || '')
            .split(',')
            .map((topic) => topic.trim())
            .filter(Boolean);
    }

    get hasTopics() {
        return this.topics.length > 0;
    }

    get aboutPlaceholder() {
        if (this.profile.isMe) {
            return 'Tell coworkers a bit about yourself. Click "Edit my profile".';
        }
        return this.profile.isPlaceholder
            ? 'An introduction will appear once they join Salesforce.'
            : `${this.profile.firstName || 'They'} hasn't added an introduction yet.`;
    }

    get reportCount() {
        return this.profile.directReports.length;
    }

    get hasReports() {
        return this.reportCount > 0;
    }

    get noTeam() {
        return !this.profile.manager && !this.hasReports;
    }

    get kudos() {
        return this.profile.kudos.map((k) => ({ ...k, when: timeAgo(k.createdDate) }));
    }

    get hasKudos() {
        return this.profile.kudos.length > 0;
    }

    openPerson(event) {
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'Intranet_Profile' },
            state: { c__userId: event.currentTarget.dataset.id }
        });
    }

    giveKudos() {
        this[NavigationMixin.Navigate]({ type: 'standard__navItemPage', attributes: { apiName: 'Intranet_Kudos' } });
    }

    openEditor() {
        const { aboutMe, askMeAbout, phone, mobile } = this.profile;
        this.draft = { aboutMe, askMeAbout, phone, mobile };
        this.isEditing = true;
    }

    closeEditor() {
        this.isEditing = false;
    }

    handleDraft(event) {
        this.draft = { ...this.draft, [event.target.name]: event.detail.value };
    }

    async saveProfile() {
        this.isSaving = true;
        try {
            await updateMyProfile(this.draft);
            this.isEditing = false;
            showToast(this, 'Profile updated', 'Coworkers will see your changes right away.');
            await refreshApex(this.wiredProfile);
        } catch (e) {
            showToast(this, 'Could not save your profile', errorMessage(e), 'error');
        } finally {
            this.isSaving = false;
        }
    }
}