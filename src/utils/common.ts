export const toProperCase = (str: string | undefined | null) => {
	if (!str || typeof str !== 'string') {
		return '';
	}
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export const toTitleCase = (str: string) => {
	return toProperCase(str);
}
