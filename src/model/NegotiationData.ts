import {parseYaml} from "obsidian";

export interface NegotiationData {
	name?: string;
	initial_patience?: number;
	current_patience?: number;
	initial_interest?: number;
	current_interest?: number;
	motivations?: Motivation[];
	pitfalls?: Pitfall[];

	[key: string]: any;
}

interface Motivation {
	name: string;
	reason: string;
	isMentioned?: boolean;
}

interface Pitfall {
	name: string;
	reason: string;
	isMentioned?: boolean;
}

export function parseNegotiationData(source: string): NegotiationData {
	let data: NegotiationData;
	try {
		data = parseYaml(source) as NegotiationData;
	} catch (error) {
		throw new Error("Invalid YAML format: " + error.message);
	}
	// Initialize default values and parse motivations and pitfalls
	data.current_patience = data.current_patience ?? data.initial_patience ?? 5;
	data.current_interest = data.current_interest ?? data.initial_interest ?? 0;
	data.motivations = data.motivations?.map(mot => ({
		name: mot.name?.trim() ?? '',
		reason: mot.reason?.trim() ?? '',
		isMentioned: mot.isMentioned ?? false
	})) ?? [];
	data.pitfalls = data.pitfalls?.map(pit => ({
		name: pit.name?.trim() ?? '',
		reason: pit.reason?.trim() ?? '',
		isMentioned: pit.isMentioned ?? false
	})) ?? [];
	return data;
}
