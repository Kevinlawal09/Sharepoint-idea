import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getTodaysCelebrations from '@salesforce/apex/CelebrationController.getTodaysCelebrations';
import postKudos from '@salesforce/apex/IntranetController.postKudos';
import { errorMessage, showToast } from 'c/intranetUtils';

const LOOK = {
    Birthday: { eyebrow: 'Today\'s birthday', emoji: '🎂', placeholder: (name) => `Happy birthday, ${name}! ` },
    'Work Anniversary': { eyebrow: 'Work anniversary', emoji: '🎉', placeholder: (name) => `Happy anniversary, ${name}! ` },
    Other: { eyebrow: 'Celebrating today', emoji: '🎉', placeholder: (name) => `Congrats, ${name}! ` }
};
const CONFETTI_COLORS = ['#f5a623', '#e31b23', '#005191', '#00a0af', '#ffd166', '#ff7a59'];
const CONFETTI_PIECES = 70;
const CONFETTI_MS = 4500;

/**
 * Today's birthdays, work anniversaries and other celebrations (Intranet_Celebration__c) on
 * Intranet Home. Coworkers sign the card, which posts a Kudos to the person. Confetti plays once
 * per person per day, and never for people who prefer reduced motion.
 */
export default class IntranetCelebrations extends NavigationMixin(LightningElement) {
    rows = [];
    signing;
    note = '';
    isSaving = false;
    showConfetti = false;
    confetti = [];

    connectedCallback() {
        this.load();
    }

    async load() {
        try {
            this.rows = await getTodaysCelebrations();
            if (this.rows.length) {
                this.celebrateOnce();
            }
        } catch (e) {
            // Celebrations are a nice-to-have; Home works fine without them.
            this.rows = [];
        }
    }

    get celebrations() {
        return this.rows.map((row) => {
            const look = LOOK[row.type] || LOOK.Other;
            const wishes = `${row.wishCount} ${row.wishCount === 1 ? 'wish' : 'wishes'}`;
            let summary;
            if (row.isMe) {
                summary = row.wishCount
                    ? `${row.wishCount} ${row.wishCount === 1 ? 'coworker has' : 'coworkers have'} signed your card today. 💛`
                    : 'Your coworkers can sign your card today. 💛';
            } else if (row.signedByMe) {
                summary = `You signed! ${wishes} so far.`;
            } else {
                summary = row.wishCount ? `${wishes} so far. Add yours!` : 'Be the first to sign the card.';
            }
            return {
                ...row,
                eyebrow: look.eyebrow,
                emoji: look.emoji,
                headline: row.isMe && row.type === 'Birthday' ? 'Happy birthday to you! 🎉' : row.headline,
                summary,
                signLabel: row.signedByMe ? 'Add another note' : `Sign ${row.firstName}'s card`
            };
        });
    }

    get notePlaceholder() {
        const look = LOOK[this.signing?.type] || LOOK.Other;
        return look.placeholder(this.signing?.firstName);
    }

    openSign(event) {
        this.signing = this.rows.find((row) => row.id === event.currentTarget.dataset.id);
        this.note = '';
    }

    closeSign() {
        this.signing = undefined;
    }

    handleNote(event) {
        this.note = event.detail.value || '';
    }

    async submitSign() {
        if (!this.note.trim()) {
            showToast(this, 'Write a note first', 'Add a few words before signing.', 'warning');
            return;
        }
        this.isSaving = true;
        try {
            await postKudos({ message: this.note, recipientId: this.signing.personId });
            showToast(this, 'Card signed', `${this.signing.firstName} will see your note.`);
            this.signing = undefined;
            await this.load();
        } catch (e) {
            showToast(this, 'Could not sign the card', errorMessage(e), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    openWishes() {
        this[NavigationMixin.Navigate]({ type: 'standard__navItemPage', attributes: { apiName: 'Intranet_Kudos' } });
    }

    celebrateOnce() {
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const key = `uwpbc-celebrated-${new Date().toDateString()}`;
        try {
            if (reduceMotion || localStorage.getItem(key)) {
                return;
            }
            localStorage.setItem(key, '1');
        } catch (e) {
            // Storage blocked: still celebrate, it just may repeat on reload.
            if (reduceMotion) {
                return;
            }
        }
        this.confetti = Array.from({ length: CONFETTI_PIECES }, (_, i) => {
            const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            const left = Math.round(Math.random() * 100);
            const delay = (Math.random() * 0.8).toFixed(2);
            const duration = (2.6 + Math.random() * 1.6).toFixed(2);
            const spin = Math.round(Math.random() * 720 - 360);
            const drift = Math.round(Math.random() * 160 - 80);
            return {
                key: `c${i}`,
                style: `left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${duration}s;--spin:${spin}deg;--drift:${drift}px;`
            };
        });
        this.showConfetti = true;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.showConfetti = false;
        }, CONFETTI_MS);
    }
}
