const ManagementApiScript = require('./lib/management-api-script');
const { QualityCriterion, convertQualityCriteria } = require('./lib/quality-criteria-converter');
const Rx = require('rxjs')
const { flatMap, map, reduce } = require('rxjs/operators');

/*
 * API name is composed of:
 * - eventually a namespace (potentially multiple words)
 * - a resource or provider (potentially multiple words)
 * - eventually a country
 * Example: Multiple words namespace - Resource or provider - Country
 */
const API_NAME_REGEX = /^(\w+( \w+)* \- )?\w+( \w+)*( \- \w+)?$/;
/*
 * Version is prefixed with a "v" and composed of one or more digits
 */
const API_VERSION_REGEX = /v\d+/;
/*
 * Context path is composed of:
 * - a context (e.g. "corp" or country in 2 letters)
 * - eventually a namespace (potentially multiple words separated with - or _)
 * - a version starting with "v" and ending with digits
 * - a resource (potentially multiple words separated with - or _)
 * - eventually a sub resource (potentially multiple words separated with - or _)
 * Example: /corp/composed-namespace/v1/composed-resource/sub-resource
 */
const API_CONTEXT_PATH_REGEX = /^\/(corp|fr|lu|pl|hu|ro|pt|uk|ru|es)(\/\w+((-|_)\w+)?)?\/v\d+\/\w+((-|_)\w+)?(\/\w+((-|_)\w+)?)?$/;
/*
 * Data classification labels are composed of:
 * - a confidentiality label as C0, C1, C2 or C3
 * - an integrity label as I1, I2 or I3
 * - an availability label as A1, A2 or A3
 */
const CONFIDENTIALITY_LABEL_REGEX = /^C[0-3]$/;
const INTEGRITY_LABEL_REGEX = /^I[1-3]$/;
const AVAILABILITY_LABEL_REGEX = /^A[1-3]$/;

const namingConventionCriteria = {
    "name": {name: "Name's naming convention complied", reference: "DF01", regex: API_NAME_REGEX},
    "version": {name: "Version's naming convention complied", reference: "DF02", regex: API_VERSION_REGEX},
    "context-path": {name: "Context-path's naming convention complied", reference: "DF18", regex: API_CONTEXT_PATH_REGEX},
};

/**
 * Extract quality criteria compliance corresponding to an API as a CSV content.
 *
 * @author Alexandre Carbenay
 */
class ExtractApiQuality extends ManagementApiScript {

    constructor() {
        super(
            'extract-api-quality',
            {
                'api-id': {
                    describe: "API UUID",
                    type: 'string',
                    demandOption: true
                },
            }
        );
    }

    definition(managementApi) {
        const qualityFunctions = Rx.of(
            this.getGraviteeQuality,
            this.calculateQualityFromDetail,
            this.validateSupportEmailDefined);
        qualityFunctions.pipe(
            flatMap(qualityFunction => qualityFunction.bind(this)(managementApi)),
            reduce((acc, criteria) => acc.concat(criteria), [])
        ).subscribe(this.defaultSubscriber(
             criteria => {
                 this.displayInfo("CSV content:");
                 this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.reference + ",", ""));
                 this.displayRaw(Array.from(criteria).reduce((acc, criteria) => acc + criteria.complied + ",", ""));
             }
         ));
    }

    getGraviteeQuality(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getQuality(this.argv['api-id']).pipe(
                    map(quality => convertQualityCriteria(quality))
                ))
            );
    }

    calculateQualityFromDetail(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.export(this.argv['api-id']).pipe(
                    flatMap(apiDetail => {
                        const detailQualityFunctions = Rx.of(
                            this.complyWithApiNameNamingConvention,
                            this.complyWithApiVersionNamingConvention,
                            this.complyWithApiContextPathNamingConvention,
                            this.complyWithEndpointsNamingConvention,
                            this.complyWithDataClassificationLabelsDefinition,
                            this.complyWithPublishedFunctionalDocAsHomePage);
                        return detailQualityFunctions.pipe(
                            map(qualityFunction => qualityFunction.bind(this)(apiDetail)),
                            reduce((acc, criteria) => acc.concat(criteria), [])
                        );
                    })
                ))
            );
    }

    validateSupportEmailDefined(managementApi) {
        return managementApi
            .login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getApiMetadata(this.argv['api-id']).pipe(
                    map(metadata => {
                        const complied = metadata.filter(data => data.key === "email-support" && data.value !== undefined && data.value.length > 0).length > 0;
                        return new QualityCriterion("Support email address defined", "DF17", complied);
                    })
                ))
            );
    }

    complyWithApiNameNamingConvention(apiDetail) {
        return this.complyWithNamingConvention(apiDetail.name, namingConventionCriteria.name);
    }

    complyWithApiVersionNamingConvention(apiDetail) {
        return this.complyWithNamingConvention(apiDetail.version, namingConventionCriteria.version);
    }

    complyWithApiContextPathNamingConvention(apiDetail) {
        return this.complyWithNamingConvention(apiDetail.proxy.context_path, namingConventionCriteria["context-path"]);
    }

    complyWithNamingConvention(value, namingConventionCriterion) {
        return new QualityCriterion(
            namingConventionCriterion.name,
            namingConventionCriterion.reference,
            this.matchNamingConvention(value, namingConventionCriterion.regex));
    }

    complyWithEndpointsNamingConvention(apiDetail) {
        const nonCompliantEndpoints = apiDetail.proxy.groups.filter(group =>
            group.endpoints !== undefined &&
            group.endpoints.filter(endpoint => !endpoint.name.startsWith(group.name + " - ")).length > 0);
        const complied = nonCompliantEndpoints == null || nonCompliantEndpoints.length == 0;
        return new QualityCriterion("Groups of endpoints and endpoints naming convention complied", "DF19", complied);
    }

    matchNamingConvention(value, regex) {
        const matches = value.match(regex);
        return matches != null && matches.length > 0;
    }

    complyWithDataClassificationLabelsDefinition(apiDetail) {
        const hasConfidentialityLabel = this.hasExactlyOneComplyingLabel(apiDetail.labels, CONFIDENTIALITY_LABEL_REGEX);
        const hasIntegrityLabel = this.hasExactlyOneComplyingLabel(apiDetail.labels, INTEGRITY_LABEL_REGEX);
        const hasAvailabilityLabel = this.hasExactlyOneComplyingLabel(apiDetail.labels, AVAILABILITY_LABEL_REGEX);
        return new QualityCriterion("Data classification labels complied", "DF06", hasConfidentialityLabel && hasIntegrityLabel && hasAvailabilityLabel);
    }

    hasExactlyOneComplyingLabel(labels, regex) {
        return labels !== undefined && labels.filter(label => this.matchNamingConvention(label, regex)).length == 1;
    }

    complyWithPublishedFunctionalDocAsHomePage(apiDetail) {
        const complied = apiDetail.pages.filter(page => page.type === "MARKDOWN" && page.published && page.homepage).length > 0;
        return new QualityCriterion("Functional documentation published as home page", "DF13", complied);
    }

}
new ExtractApiQuality().run();