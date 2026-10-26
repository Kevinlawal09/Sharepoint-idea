import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import getKudos from '@salesforce/apex/IntranetController.getKudos';
import postKudos from '@salesforce/apex/IntranetController.postKudos';
import toggleStar from '@salesforce/apex/IntranetController.toggleStar';
import { errorMessage, showToast, timeAgo } from 'c/intranetUtils';

export default class KudosWall extends LightningElement {
    message = '';
    recipientId;
    kudos = [];
    error;
    isLoaded = false;
    isPosting = false;
    wiredKudos;

    @wire(getKudos)
    handleKudos(result) {
        this.wiredKudos = result;
        if (result.data) {
            this.kudos = result.data.map((k) => {
                const starred = (k.Stars__r || []).length > 0;
                return {
                    id: k.Id,
                    message: k.Message__c,
                    from: k.CreatedBy?.Name,
                    to: k.Recipient__r?.Name,
                    when: timeAgo(k.CreatedDate),
                    stars: k.Star_Count__c || 0,
                    pressed: String(starred),
                    starLabel: starred ? 'Remove your star' : 'Add a star',
                    starClass: `uw-btn uw-btn_small ${starred ? 'uw-btn_gold' : 'uw-btn_ghost'}`
                };
            });
            this.error = undefined;
            this.isLoaded = true;
        } else if (result.error) {
            this.error = errorMessage(result.error);
            this.isLoaded = true;
        }
    }

    get hasKudos() {
        return this.kudos.length > 0;
    }

    get cannotPost() {
        return this.isPosting || !this.message.trim();
    }

    handleMessage(event) {
        this.message = event.detail.value || '';
    }

    handleRecipient(event) {
        this.recipientId = event.detail.recordId;
    }

    async handlePost() {
        this.isPosting = true;
        try {
            await postKudos({ message: this.message, recipientId: this.recipientId });
            this.message = '';
            this.recipientId = undefined;
            this.template.querySelector('lightning-record-picker').clearSelection();
            showToast(this, 'Kudos posted', 'Thanks for recognizing a teammate.');
            await refreshApex(this.wiredKudos);
        } catch (e) {
            showToast(this, 'Could not post kudos', errorMessage(e), 'error');
        } finally {
            this.isPosting = false;
        }
    }

    async handleStar(event) {
        try {
            await toggleStar({ kudosId: event.currentTarget.dataset.id });
            await refreshApex(this.wiredKudos);
        } catch (e) {
            showToast(this, 'Could not update star', errorMessage(e), 'error');
        }
    }
}