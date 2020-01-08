/**
 * Numeric value if no result is given when String.search() is applied
 *
 * @type {number}
 */
const NO_RESULT_ON_STRING_SEARCH = -1;

/**
 * String flag to customize a regular expression as case insensitive
 *
 * @type {string}
 */
const INSENSITIVE_REGEX_FLAG = "i";

/**
 * Some utilities when manipulating String
 *
 * @author Aurelien Bourdon
 */
class StringUtils {

    /**
     * Do a String#search() according to given RegExp#flags
     *
     * @param text the text to search
     * @param regex the regex to apply on text to search
     * @param flags option to add to regex search
     * @returns {number | never} same result as String#search
     */
    static search(text, regex, flags) {
        return text.search(new RegExp(regex, flags));
    }

    /**
     * Test if given regex matches on given text, by using optional flags
     *
     * @param text the text to test
     * @param regex the regex to apply
     * @param flags the optional flags to apply on regex search
     * @returns {boolean} true if regex matches on text, false otherwise
     */
    static matches(text, regex, flags) {
        return this.search(text, regex, flags) !== NO_RESULT_ON_STRING_SEARCH;
    }

    /**
     * Do a case insensitive String#search (equivalent with text.search(new RegExp(text, "i")))
     *
     * @param text the text to search
     * @param regex the regex to apply on text to search, without being case sensitive
     * @returns {number | never} same result as String#search
     */
    static caseInsensitiveSearch(text, regex) {
        return this.search(text, regex, INSENSITIVE_REGEX_FLAG);
    }

    /**
     * Test if given regex matches on given text, without being case sensitive
     *
     * @param text the text to test
     * @param regex the regex to apply
     * @returns {boolean} true if regex matches on text, false otherwise
     */
    static caseInsensitiveMatches(text, regex) {
        return this.matches(text, regex, INSENSITIVE_REGEX_FLAG);
    }

    /**
     * Give a comparison score of the two given strings, in alphabetical order
     *
     * @param left the first string to compare
     * @param right the second string to compare
     * @returns {number} -1 if left < right, 1 if left > right or 0 if equal
     */
    static compare(left, right) {
        const lowerLeft = left.toLowerCase();
        const lowerRight = right.toLowerCase();
        return lowerLeft < lowerRight ? -1 : lowerLeft > lowerRight ? 1 : 0;
    }

}

module.exports = StringUtils;