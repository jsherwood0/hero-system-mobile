import { Alert } from 'react-native';
import CharacterTrait from '../CharacterTrait';
import { SKILL_CHECK } from '../../lib/DieRoller';

export const SKILL_ROLL_BASE = 9;

const SKILL_FAMILIARITY_BASE = 8;

const SKILL_PROFICIENCY_BASE = 10;

const SKILL_GENERAL_CHARACTERISTIC = 11;

export default class Roll extends CharacterTrait {
    constructor(characterTrait) {
        super(characterTrait.trait, characterTrait.listKey, characterTrait.getCharacter);

        this.characterTrait = characterTrait;
    }

    cost() {
        return this.characterTrait.cost();
    }

    costMultiplier() {
        return this.characterTrait.costMultiplier();
    }

    activeCost() {
        return this.characterTrait.activeCost();
    }

    realCost() {
        return this.characterTrait.realCost();
    }

    label() {
        return this.characterTrait.label();
    }

    attributes() {
        return this.characterTrait.attributes();
    }

    definition() {
        return this.characterTrait.definition();
    }

    roll() {
        let roll = null;

        if (this.characterTrait.trait.proficiency) {
            roll = SKILL_PROFICIENCY_BASE;
        } else if (this.characterTrait.trait.familiarity || this.characterTrait.trait.everyman) {
            roll = SKILL_FAMILIARITY_BASE
        } else if (this.characterTrait.trait.hasOwnProperty('characteristic') && this.characterTrait.trait.characteristic === 'GENERAL') {
            if (this.characterTrait.trait.xmlid.toUpperCase() !== 'COMBAT_LEVELS') {
                roll = SKILL_GENERAL_CHARACTERISTIC;
            }
        } else if (this.characterTrait.trait.hasOwnProperty('characteristic')) {
            roll = parseInt(this.characterTrait.getCharacter().characteristics.filter(c => c.shortName.toLowerCase() === this.characterTrait.trait.characteristic.toLowerCase()).shift().roll.slice(0, -1), 10);
        }

        if (roll !== null) {
            roll = `${roll + this.characterTrait.trait.levels}-`;
        }

        return {
            roll: roll,
            type: SKILL_CHECK
        }
    }

    advantages() {
        return this.characterTrait.advantages();
    }

    limitations() {
        return this.characterTrait.limitations();
    }
}