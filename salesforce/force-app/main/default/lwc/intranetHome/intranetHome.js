import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import USER_ID from '@salesforce/user/Id';
import FIRST_NAME from '@salesforce/schema/User.FirstName';
import { DEPARTMENTS, NEWS } from 'c/intranetContent';

const QUICK_ACTIONS = [
    { id: 'ticket', label: 'Submit IT ticket', primary: true, target: { type: 'standard__objectPage', attributes: { objectApiName: 'Case', actionName: 'new' } } },
    { id: 'pto', label: 'Request PTO', target: { type: 'standard__objectPage', attributes: { objectApiName: 'PTO_Request__c', actionName: 'new' } } },
    { id: 'kudos', label: 'Give kudos', target: { type: 'standard__navItemPage', attributes: { apiName: 'Intranet_Kudos' } } },
    { id: 'idea', label: 'Share an idea', target: { type: 'standard__navItemPage', attributes: { apiName: 'Intranet_Ideas' } } },
    { id: 'files', label: 'Find a file', target: { type: 'standard__navItemPage', attributes: { apiName: 'Intranet_Files' } } },
    { id: 'people', label: 'Find a person', target: { type: 'standard__navItemPage', attributes: { apiName: 'Intranet_Directory' } } }
];

export default class IntranetHome extends NavigationMixin(LightningElement) {
    news = NEWS;
    departments = DEPARTMENTS;

    @wire(getRecord, { recordId: USER_ID, fields: [FIRST_NAME] })
    user;

    get greeting() {
        const hour = new Date().getHours();
        const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const firstName = getFieldValue(this.user?.data, FIRST_NAME);
        return firstName ? `${part}, ${firstName}` : part;
    }

    get quickActions() {
        return QUICK_ACTIONS.map((action) => ({
            ...action,
            className: action.primary ? 'uw-btn uw-btn_gold' : 'uw-btn hero__btn'
        }));
    }

    handleQuickAction(event) {
        const action = QUICK_ACTIONS.find((a) => a.id === event.currentTarget.dataset.id);
        this[NavigationMixin.Navigate](action.target);
    }

    openDepartment(event) {
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: 'Intranet_Files' },
            state: { c__department: event.currentTarget.dataset.id }
        });
    }
}