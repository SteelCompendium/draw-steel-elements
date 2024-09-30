import {PowerRollTiers} from "../drawSteelAdmonition/negotiationTrackerProcessor";

export class ArgumentPowerRoll {
	public t1: ArgumentResult;
	public t2: ArgumentResult;
	public t3: ArgumentResult;
	public crit: ArgumentResult;

	constructor(t1: ArgumentResult, t2: ArgumentResult, t3: ArgumentResult, crit: ArgumentResult) {
		this.t1 = t1;
		this.t2 = t2;
		this.t3 = t3;
		this.crit = crit;
	}

	static build(usedMotivation: boolean, usedPitfall: boolean, caughtLying: boolean, reusedMotivation: boolean, sameArgument: boolean): ArgumentPowerRoll {
		let result = ArgumentPowerRoll.buildBaseline(usedMotivation, usedPitfall, reusedMotivation, sameArgument);

		// Modify if caught lying
		if (caughtLying) {
			if (result.t1.interest <= 0) result.t1.interest -= 1;
			if (result.t2.interest <= 0) result.t2.interest -= 1;
			if (result.t3.interest <= 0) result.t3.interest -= 1;
			if (result.crit.interest <= 0) result.crit.interest -= 1;
		}

		return result;
	}

	private static buildBaseline(usedMotivation: boolean, usedPitfall: boolean, reusedMotivation: boolean, sameArgument: boolean): ArgumentPowerRoll {
		// Used pitfall
		if (usedPitfall) {
			return new ArgumentPowerRoll(
				new ArgumentResult(-1, -1),
				new ArgumentResult(-1, -1),
				new ArgumentResult(-1, -1),
				new ArgumentResult(-1, -1),
			);
		}

		// Reused Motivation
		if (reusedMotivation) {
			return new ArgumentPowerRoll(
				new ArgumentResult(0, -1),
				new ArgumentResult(0, -1),
				new ArgumentResult(0, -1),
				new ArgumentResult(0, -1),
			);
		}

		// Used Motivation
		if (usedMotivation) {
			return new ArgumentPowerRoll(
				new ArgumentResult(0, -1),
				new ArgumentResult(+1, -1),
				new ArgumentResult(+1, 0),
				new ArgumentResult(+1, 0),
			);
		}

		// Same Argument without Motivation
		if (sameArgument) {
			return new ArgumentPowerRoll(
				new ArgumentResult(-1, -1),
				new ArgumentResult(-1, -1),
				new ArgumentResult(-1, -1),
				new ArgumentResult(-1, -1)
			);
		}

		// Normal Argument
		return new ArgumentPowerRoll(
			new ArgumentResult(-1, -1),
			new ArgumentResult(0, -1),
			new ArgumentResult(+1, -1),
			new ArgumentResult(+1, 0),
		);
	}

	toPowerRollTiers() {
		return new PowerRollTiers(
			this.t1.toString(),
			this.t2.toString(),
			this.t3.toString(),
			this.crit.toString(),
		);
	}
}

export class ArgumentResult {
	public interest: number;
	public patience: number;
	public other: string;

	constructor(interest: number, patience: number, other?: string) {
		this.interest = interest;
		this.patience = patience;
		this.other = other ?? "";
	}

	public toString = (): string => {
		let result = "";
		if (this.interest != 0) {
			result += `${this.interest > 0 ? '+' : ''}${this.interest} Interest`;
		}
		if (this.patience != 0) {
			if (result != "") {
				result += ", ";
			}
			result += `${this.patience > 0 ? '+' : ''}${this.patience} Patience`;
		}
		if (this.other != "") {
			if (result != "") {
				result += ", ";
			}
			result += this.other;
		}
		if (result == "") {
			result = "No effect";
		}
		return result;
	}
}
