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
     * Do a case insensitive String#search (equivalent with text.search(new RegExp(text, "i")))
     *
     * @param text the text to search
     * @param regex the regex to apply on text to search, without being case sensitive
     * @returns {number | never} same result as String#search
     */
    static caseInsensitiveSearch(text, regex) {
        return text.search(new RegExp(regex, INSENSITIVE_REGEX_FLAG));
    }

    /**
     * Test if given regex matches on given text, without being case sensitive
     *
     * @param text the text to test
     * @param regex the regex to apply
     * @returns {boolean} true if regex matches on text, false otherwise
     */
    static caseInsensitiveMatches(text, regex) {
        return this.caseInsensitiveSearch(text, regex) !== NO_RESULT_ON_STRING_SEARCH;
    }

}

module.exports = StringUtils;