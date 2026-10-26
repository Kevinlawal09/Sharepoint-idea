import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';
import MANAGE_INTRANET from '@salesforce/customPermission/Manage_Intranet';
import getEvents from '@salesforce/apex/IntranetController.getEvents';
import toggleRsvp from '@salesforce/apex/IntranetController.toggleRsvp';
import { errorMessage, eventDateParts, showToast } from 'c/intranetUtils';

export default class EventList extends NavigationMixin(LightningElement) {
    events = [];
    error;
    isLoaded = false;
    wiredEvents;

    get canManage() {
        return !!MANAGE_INTRANET;
    }

    @wire(getEvents)
    handleEvents(result) {
        this.wiredEvents = result;
        if (result.data) {
            this.events = result.data.map((evt) => {
                const going = (evt.RSVPs__r || []).length > 0;
                const count = evt.RSVP_Count__c || 0;
                return {
                    id: evt.Id,
                    name: evt.Name,
                    location: evt.Location__c,
                    details: evt.Details__c,
                    ...eventDateParts(evt.Start__c),
                    pressed: String(going),
                    rsvpLabel: going ? 'Going ✓' : 'RSVP',
                    rsvpClass: `uw-btn uw-btn_small ${going ? 'uw-btn_gold' : ''}`,
                    goingLabel: `${count} going`
                };
            });
            this.error = undefined;
            this.isLoaded = true;
        } else if (result.error) {
            this.error = errorMessage(result.error);
            this.isLoaded = true;
        }
    }

    get hasEvents() {
        return this.events.length > 0;
    }

    async handleRsvp(event) {
        try {
            const going = await toggleRsvp({ eventId: event.currentTarget.dataset.id });
            showToast(this, going ? "You're going" : 'RSVP cancelled', going ? 'See you there.' : 'Maybe next time.');
            await refreshApex(this.wiredEvents);
        } catch (e) {
            showToast(this, 'Could not update RSVP', errorMessage(e), 'error');
        }
    }

    handleNewEvent() {
        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: { objectApiName: 'Intranet_Event__c', actionName: 'new' }
        });
    }
}