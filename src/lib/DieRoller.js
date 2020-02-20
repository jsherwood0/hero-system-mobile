import { Alert } from 'react-native';
import { common } from './Common';

// Copyright 2018-Present Philip J. Guinchard
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export const SKILL_CHECK = 1;

export const TO_HIT = 2;

export const NORMAL_DAMAGE = 3;

export const KILLING_DAMAGE = 4;

export const EFFECT = 5;

export const HIT_LOCATIONS = 6;

export const KNOCKBACK = 7;

export const PARTIAL_DIE_PLUS_ONE = 1;

export const PARTIAL_DIE_HALF = 2;

export const PARTIAL_DIE_MINUS_ONE = 3;

class DieRoller {
    constructor() {
        this.validLastRollTypes = [
            SKILL_CHECK,
            TO_HIT,
            NORMAL_DAMAGE,
            KILLING_DAMAGE,
            EFFECT,
        ];
    }

    rollCheck(threshold = null) {
        let regex = /^([0-9]+\-|[0-9]+\-\s\/\s[0-9]+\-)$/;
        let result = this._roll(3, SKILL_CHECK);
        result.threshold = -1;

        if (threshold !== null && regex.test(threshold)) {
            let rollThreshold = threshold;

            if (threshold.indexOf('/') !== -1) {
                rollThreshold = threshold.split(' / ')[1];
            }

            result.threshold = rollThreshold.slice(0, -1);
        }

        return result;
    }

    rollToHit(cv, numberOfRolls, isAutofire, targetDcv) {
        let results = [];
        let result;

        for (let i = 0; i < numberOfRolls; i++) {
            result = this._roll(3, TO_HIT);
            result.hitCv = 11 + parseInt(cv, 10) - result.total;
            result.cv = cv;
            result.isAutofire = isAutofire;
            result.targetDcv = targetDcv;

            if (isAutofire) {
                result.hits = 0;

                if (result.hitCv - targetDcv >= 0) {
                    result.hits = Math.floor((result.hitCv - targetDcv) / 2) + 1;
                }
            }

            results.push(result);
        }

        return {'results': results};
    }

    rollDamage(damageForm) {
        let resultRoll = this._roll(damageForm.dice, damageForm.damageType, damageForm.partialDie);
        let hitLocationRoll = damageForm.useHitLocations ? this._roll(3, HIT_LOCATIONS).total : 10;
        resultRoll.damageForm = damageForm;
        resultRoll.sfx = damageForm.sfx;

        if (damageForm.damageType === KILLING_DAMAGE) {
            resultRoll.stunMultiplier = damageForm.stunMultiplier;
        }

        resultRoll.hitLocationDetails = this._getHitLocationModifiers(hitLocationRoll);
        resultRoll.body = this._calculateBody(resultRoll);
        resultRoll.stun = this._calculateStun(resultRoll);
        resultRoll.knockback = this._calculateKnockback(
            resultRoll,
            damageForm.isTargetFlying,
            damageForm.isMartialManeuver,
            damageForm.isTargetInZeroG,
            damageForm.isTargetUnderwater,
            damageForm.rollWithPunch,
            damageForm.isUsingClinging
        );

        if (damageForm.isExplosion) {
            resultRoll.rolls.sort((a, b) => a - b).reverse();
            resultRoll.explosion = [{
                distance: 0,
                stun: resultRoll.stun,
                body: resultRoll.body,
                knockback: resultRoll.knockback,
            }];

            let newResultRoll = {...resultRoll};
            newResultRoll.rolls = resultRoll.rolls.slice();

            this._buildExplosionTable(resultRoll, newResultRoll);
        }

        return resultRoll;
    }

    effectRoll(dice, partialDie, type, sfx) {
        let resultRoll = this._roll(dice, EFFECT, partialDie);

        resultRoll.dice = dice;
        resultRoll.type = type;
        resultRoll.sfx = sfx;

        return resultRoll;
    }

    rollAgain(lastResult) {
        let result = null;
        let numberOfRolls;

        if (lastResult.hasOwnProperty('results')) {
            numberOfRolls = lastResult.results.length;
            lastResult = lastResult.results[0];
        }

        if (lastResult.rollType === SKILL_CHECK) {
            result = this.rollCheck(lastResult.threshold + '-');
        } else if (lastResult.rollType === TO_HIT) {
            result = this.rollToHit(lastResult.cv, numberOfRolls, lastResult.isAutofire, lastResult.targetDcv);
        } else if (lastResult.rollType === NORMAL_DAMAGE || lastResult.rollType === KILLING_DAMAGE) {
            result = this.rollDamage(lastResult.damageForm);
        } else if (lastResult.rollType === EFFECT) {
            result = this.effectRoll(lastResult.dice, lastResult.partialDie, lastResult.type, lastResult.sfx);
        }

        return result;
    }

    countNormalDamageBody(resultRoll) {
        let body = 0;

        for (let roll of resultRoll.rolls) {
            if (roll >= 2 && roll <= 5) {
                body += 1;
            } else if (roll === 6) {
                body += 2;
            }
        }

        return body;
    }

    countLuck(resultRoll) {
        let luckPoints = 0;

        for (let roll of resultRoll.rolls) {
            if (roll === 6) {
                luckPoints++;
            }
        }

        return luckPoints;
    }

    getPartialDieName(partialDieType) {
        let name = 'None';

        if (partialDieType === PARTIAL_DIE_PLUS_ONE) {
            name = '+1 pip'
        } else if (partialDieType === PARTIAL_DIE_MINUS_ONE) {
            name = '-1 pip'
        } else if (partialDieType === PARTIAL_DIE_HALF) {
            name = '½d6';
        }

        return name;
    }

    toMessages(result) {
        let messages = [];

        switch (result.rollType) {
            case SKILL_CHECK:
                messages = this._toSkillCheckMessage(result);
                break;
            case NORMAL_DAMAGE:
            case KILLING_DAMAGE:
                messages = this._toDamageMessage(result);
                break;
            case EFFECT:
                messages = this._toEffectMessage(result);
                break;
            default:
                if (result.hasOwnProperty('results')) {
                    messages = this._toHitMessage(result);
                } else {
                    messages.push(`I rolled ${result.total} on ${result.rolls.length} dice`);
                }
        }

        return messages;
    }

    _toSkillCheckMessage(result) {
        let messages = [];

        if (result.threshold > -1) {
            if (result.total === 3) {
                messages.push('I succeeded my skill check (rolled a 3)');
            } else if (result.total === 18) {
                messages.push('I failed my skill check (rolled an 18)');
            } else {
                let overUnder = result.threshold - result.total;

                if (overUnder === 0) {
                    messages.push('I made my skill check with no points to spare');
                } else if (overUnder > 0) {
                    messages.push(`I made my skill check by ${overUnder} points`);
                } else {
                    messages.push(`I failed my skill check by ${overUnder * -1} points`);
                }
            }
        } else {
            messages.push(`I rolled ${result.total} total on 3d6`);
        }

        return messages;
    }

    _toDamageMessage(result) {
        let messages = [];
        let knockback = result.knockback < 0 ? 0 : result.knockback;
        let damageType = result.rollType === KILLING_DAMAGE ? 'Killing' : 'Normal';

        if (result.useFifthEdition) {
            knockback = `${result.knockback / 2}"`;
        } else {
            knockback = `${result.knockback}m`;
        }

        messages.push(`I inflicted ${result.stun} STUN and ${result.body} BODY of ${damageType} damage and knocked back the target ${knockback}`);

        return messages;
    }

    _toEffectMessage(result) {
        let messages = [];

        switch (result.type.toUpperCase()) {
            case 'NONE':
                messages.push(`I rolled ${result.total} on ${result.rolls.length} dice`);
                break;
            case 'AID':
            case 'SUCCOR':
                messages.push(`I have added ${result.total} AP to the target power/effect`);
                break;
            case 'DISPEL':
                messages.push(`I have dispelled ${result.total} AP of the target power/effect`);
                break;
            case 'DRAIN':
                messages.push(`I have subtracted ${result.total} AP of the target power/effect`);
                break;
            case 'ENTANGLE':
                messages.push(`My entangle has a BODY of ${this.countNormalDamageBody(result)}`);
                break;
            case 'FLASH':
            case 'MARTIAL_FLASH':
                messages.push(`I flashed my target for ${this.countNormalDamageBody(result)} segments`);
                break;
            case 'HEALING':
                messages.push(`I healed my target for ${result.total} points`);
                break;
            case 'LUCK':
                messages.push(`I have acquired ${this.countLuck(result)} points of Luck`);
                break;
            case 'UNLUCK':
                messages.push(`I have acquired ${dieRoller.countLuck(result)} points of Unluck`);
                break;
            default:
                messages.push(`I have scored ${result.total} points on my effect`);
        }

        return messages;
    }

    _toHitMessage(result) {
        let messages = [];

        for (const r of result.results) {
            if (r.total === 3) {
                messages.push(`I have critically hit my target!`);
            } else if (r.total === 18) {
                messages.push(`I have missed my target`);
            }

            if (r.isAutofire) {
                if (r.hits > 0) {
                    messages.push(`I can hit my target up to ${r.hits}x`);
                } else {
                    messages.push(`I have missed my target with all of my shots`);
                }
            }

            messages.push(`I can hit a DCV/DMCV of ${r.hitCv} or less`);
        }

        return messages;
    }

    _roll(dice, rollType, partialDieType) {
        let resultRoll = {
            rollType: rollType,
            total: 0,
            rolls: [],
            partialDieType: partialDieType || null,
        };
        let roll = 0;

        for (let i = 0; i < dice; i++) {
            roll = Math.floor(Math.random() * 6) + 1;

            resultRoll.total += roll;
            resultRoll.rolls.push(roll);
        }

        if (partialDieType === PARTIAL_DIE_PLUS_ONE) {
            resultRoll.total += 1;
        } else if (partialDieType === PARTIAL_DIE_MINUS_ONE) {
            resultRoll.total -= 1;
        } else if (partialDieType === PARTIAL_DIE_HALF) {
            let halfDie = Math.floor(Math.random() * 3) + 1;

            resultRoll.total += halfDie;
            resultRoll.rolls.push(halfDie);
        }

        return resultRoll;
    }

    _calculateStun(resultRoll) {
        let stun = 0;

        if (resultRoll.rollType === KILLING_DAMAGE) {
            if (resultRoll.damageForm.useHitLocations) {
                stun = resultRoll.total * (resultRoll.hitLocationDetails.stunX + parseInt(resultRoll.stunMultiplier));
            } else {
                if (resultRoll.stunModifier === undefined) {
                    resultRoll.stunModifier = 1;

                    if (resultRoll.damageForm.useFifthEdition) {
                        resultRoll.stunModifier = Math.floor(Math.random() * 6) + 1;
                        resultRoll.stunModifier--;

                        if (resultRoll.stunModifier === 0) {
                            resultRoll.stunModifier = 1;
                        }
                    } else {
                        resultRoll.stunModifier = Math.floor(Math.random() * 3) + 1;
                    }
                }

                stun = resultRoll.total * (resultRoll.stunModifier + parseInt(resultRoll.stunMultiplier));
            }
        } else {
            stun = resultRoll.total;
        }

        return stun;
    }

    _calculateBody(resultRoll) {
        let body = 0;

        if (resultRoll.rollType === NORMAL_DAMAGE) {
            body += this.countNormalDamageBody(resultRoll);
        } else if (resultRoll.rollType === KILLING_DAMAGE) {
            body += resultRoll.total;
        }

        return body;
    }

    _calculateKnockback(resultRoll, isTargetFlying, isMartialManeuver, zeroG, underwater, rolledWithPunch, usingClinging) {
        if (resultRoll.knockbackRollTotal === undefined) {
            let knockbackDice = 2;

            if (isMartialManeuver) {
                knockbackDice++;
            }

            if (underwater) {
                knockbackDice++;
            }

            if (usingClinging) {
                knockbackDice++;
            }

            if (isTargetFlying) {
                knockbackDice--;
            }

            if (zeroG) {
                knockbackDice--;
            }

            if (rolledWithPunch) {
                knockbackDice--;
            }

            if (resultRoll.rollType === KILLING_DAMAGE) {
                knockbackDice++;
            }

            resultRoll.knockbackRollTotal = knockbackDice <= 0 ? 0 : this._roll(knockbackDice, KNOCKBACK).total;
        }

        return (resultRoll.body - resultRoll.knockbackRollTotal) * 2;
    }

    _buildExplosionTable(resultRoll, newResultRoll) {
        newResultRoll.rolls.shift();
        newResultRoll.total = newResultRoll.rolls.reduce((a, b) => a + b, 0);
        newResultRoll.stun = this._calculateStun(newResultRoll);
        newResultRoll.body = this._calculateBody(newResultRoll);
        newResultRoll.knockback = this._calculateKnockback(newResultRoll);

        resultRoll.explosion.push({
            distance: (resultRoll.rolls.length - newResultRoll.rolls.length) * resultRoll.damageForm.fadeRate * 2,
            stun: newResultRoll.stun,
            body: newResultRoll.body,
            knockback: newResultRoll.knockback,
        });

        if (newResultRoll.rolls.length >= 2) {
            this._buildExplosionTable(resultRoll, newResultRoll);
        }
    }

    _getHitLocationModifiers(hitLocationRoll) {
        if (hitLocationRoll >= 3 && hitLocationRoll <= 5) {
            return {
                location: 'Head',
                stunX: 5,
                nStun: 2,
                bodyX: 2,
            };
        } else if (hitLocationRoll == 6) {
            return {
                location: 'Hands',
                stunX: 1,
                nStun: 0.5,
                bodyX: 0.5,
            };
        } else if (hitLocationRoll >= 7 && hitLocationRoll <= 8) {
            return {
                location: 'Arms',
                stunX: 2,
                nStun: 0.5,
                bodyX: 0.5,
            };
        } else if (hitLocationRoll == 9) {
            return {
                location: 'Shoulders',
                stunX: 3,
                nStun: 1,
                bodyX: 1,
            };
        } else if (hitLocationRoll >= 10 && hitLocationRoll <= 11) {
            return {
                location: 'Chest',
                stunX: 3,
                nStun: 1,
                bodyX: 1,
            };
        } else if (hitLocationRoll == 12) {
            return {
                location: 'Stomach',
                stunX: 4,
                nStun: 1.5,
                bodyX: 1,
            };
        } else if (hitLocationRoll == 13) {
            return {
                location: 'Vitals',
                stunX: 4,
                nStun: 1.5,
                bodyX: 2,
            };
        } else if (hitLocationRoll == 14) {
            return {
                location: 'Thighs',
                stunX: 2,
                nStun: 1,
                bodyX: 1,
            };
        } else if (hitLocationRoll >= 15 && hitLocationRoll <= 16) {
            return {
                location: 'Legs',
                stunX: 2,
                nStun: 0.5,
                bodyX: 0.5,
            };
        } else {
            return {
                location: 'Feet',
                stunX: 1,
                nStun: 0.5,
                bodyX: 0.5,
            };
        }
    }
}

export let dieRoller = new DieRoller();
