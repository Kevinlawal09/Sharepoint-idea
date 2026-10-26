import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import MANAGE_INTRANET from '@salesforce/customPermission/Manage_Intranet';
import getIdeas from '@salesforce/apex/IntranetController.getIdeas';
import submitIdea from '@salesforce/apex/IntranetController.submitIdea';
import vote from '@salesforce/apex/IntranetController.vote';
import { errorMessage, showToast, timeAgo } from 'c/intranetUtils';

const STATUS_BADGES = {
    'Under Review': 'uw-badge',
    Planned: 'uw-badge uw-badge_gold',
    'In Progress': 'uw-badge uw-badge_gold',
    Done: 'uw-badge uw-badge_green',
    'Not Planned': 'uw-badge uw-badge_muted'
};

export default class IdeaExchange extends NavigationMixin(LightningElement) {
    title = '';
    description = '';
    ideas = [];
    error;
    isLoaded = false;
    isSubmitting = false;
    wiredIdeas;

    get canManage() {
        return !!MANAGE_INTRANET;
    }

    @wire(getIdeas)
    handleIdeas(result) {
        this.wiredIdeas = result;
        if (result.data) {
            this.ideas = result.data.map((idea) => {
                const voted = (idea.Votes__r || []).length > 0;
                const votes = idea.Vote_Count__c || 0;
                return {
                    id: idea.Id,
                    title: idea.Name,
                    description: idea.Description__c,
                    status: idea.Status__c,
                    badgeClass: STATUS_BADGES[idea.Status__c] || 'uw-badge',
                    author: idea.CreatedBy?.Name,
                    when: timeAgo(idea.CreatedDate),
                    votes,
                    voteNoun: votes === 1 ? 'vote' : 'votes',
                    voted,
                    voteLabel: voted ? 'Voted ✓' : 'Vote',
                    voteClass: `uw-btn uw-btn_small ${voted ? 'uw-btn_ghost' : ''}`
                };
            });
            this.error = undefined;
            this.isLoaded = true;
        } else if (result.error) {
            this.error = errorMessage(result.error);
            this.isLoaded = true;
        }
    }

    get hasIdeas() {
        return this.ideas.length > 0;
    }

    get cannotSubmit() {
        return this.isSubmitting || !this.title.trim();
    }

    handleTitle(event) {
        this.title = event.detail.value || '';
    }

    handleDescription(event) {
        this.description = event.detail.value || '';
    }

    async handleSubmit() {
        this.isSubmitting = true;
        try {
            await submitIdea({ title: this.title, description: this.description });
            this.title = '';
            this.description = '';
            showToast(this, 'Idea submitted', 'Thanks! Your idea is now under review.');
            await refreshApex(this.wiredIdeas);
        } catch (e) {
            showToast(this, 'Could not submit idea', errorMessage(e), 'error');
        } finally {
            this.isSubmitting = false;
        }
    }

    async handleVote(event) {
        try {
            await vote({ ideaId: event.currentTarget.dataset.id });
            await refreshApex(this.wiredIdeas);
        } catch (e) {
            showToast(this, 'Could not vote', errorMessage(e), 'error');
        }
    }

    handleEdit(event) {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: event.currentTarget.dataset.id,
                objectApiName: 'Intranet_Idea__c',
                actionName: 'edit'
            }
        });
    }
}