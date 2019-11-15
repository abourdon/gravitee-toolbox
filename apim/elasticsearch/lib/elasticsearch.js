const util = require('util');
const request = require('request-promise');
const Rx = require('rxjs');
const { catchError, concatMap, expand, filter, flatMap, map, reduce, take } = require('rxjs/operators')

/**
 * Elasticsearch client instance.
 *
 * @author Alexandre Carbenay
 */
class ElasticSearch {

    /**
     * Create a new ElasticSearch client instance according to the given settings
     *
     * @param {object} elasticSearchSettings settings of this ElasticSearch client instance
     */
    constructor(elasticSearchSettings) {
        this.settings = elasticSearchSettings;
    }

    /**
     * Search hits in the specified index pattern corresponding to the specified terms for the specified time range.
     *
     * @param {string} elasticsearch index name pattern
     * @param {string} time range lower bound
     * @param {string} time range upper bound
     * @param {map} search terms (optional)
     * @param {number} page size (default = 100)
     * @param {string} time key in index (default = "@timestamp")
     * @return a stream of Elasticsearch documents
     */
    searchHits(indexPattern, from, to = 'now', searchTerms = [], pageSize = 100, timeKey = "@timestamp") {
        var terms = Array.from(searchTerms)
            .map(([key, value]) => ({ "term": { [key]: { "value": value } } }))
            .reduce((acc, term) => acc.concat(term), []);
        terms.push({"range":{[timeKey]:{"gte":from,"lte":to}}});

        const requestSettings = {
            method: 'get',
            url: util.format('%s/_search', indexPattern),
            body: {
              "size": pageSize,
              "query": {
                "bool": {
                  "must": [
                    terms
                  ]
                }
              },
              "sort": [
                {[timeKey]: "asc"},
                {"_uid": "desc"}
              ]
            }
        };
        return this._requestAllPages(requestSettings);
    }

    aggregateHits(indexName, aggregation, from, to = 'now', searchTerms = [], timeKey = "@timestamp") {
        const terms = Array.from(searchTerms)
            .map(([key, value]) => ({ "term": { [key]: { "value": value } } }))
            .reduce((acc, term) => acc.concat(term), []);
        terms.push({"range":{[timeKey]:{"gte":from,"lte":to}}});

        const requestSettings = {
            method: 'get',
            url: util.format('%s/_search', indexName),
            body: {
            "size": 0,
              "query": {
                "bool": {
                  "must": [
                    terms
                  ]
                }
              },
              "aggs" : aggregation
            }
        };
        return this._request(requestSettings);
    }

    /**
     * Delete document corresponding to the specified id from the specified index and type.
     *
     * @param {string} elasticsearch index name
     * @param {string} elasticsearch index type
     * @param {string} document id
     * @param {boolean} indicates whether function must throw an error in case of error HTTP status (default = false)
     * @return a stream containing the deleted document id
     */
    deleteDoc(indexName, indexType, docId, failOnError = false) {
        const requestSettings = {
            method: 'delete',
            url: util.format('%s/%s/%s', indexName, indexType, docId)
        };
        return this._request(requestSettings)
            .pipe(
                catchError(e => {
                    if (failOnError) throw e;
                    return Rx.empty();
                }),
                map(response => response._id)
            );
    }

    /**
     * Delete document corresponding to the specified ids from the specified index and type in a bulk request.
     *
     * @param {array} document ids
     * @param {string} elasticsearch index name
     * @param {string} elasticsearch index type (optional)
     * @return a stream of Elasticsearch deletion status
     */
    bulkDelete(documentIds, indexName, indexType) {
        return Rx.of(this._buildBulkDeleteRequest(documentIds, indexName, indexType))
            .pipe(
                flatMap(request => this._request(request).pipe(
                    flatMap(response => response.items),
                    map(item => item['delete'])
                ))
            );
    }

    /**
     * Builds a bulk deletion request.
     *
     * @param {array} document ids
     * @param {string} elasticsearch index name
     * @param {string} elasticsearch index type (optional)
     * @return the request to execute for bulk deletion
     */
    _buildBulkDeleteRequest(documentIds, indexName, indexType) {
        const requestData = documentIds
            .map(documentId => indexType !== undefined
                ? util.format('{"delete":{"_type":"%s","_id":"%s"}}\n', indexType, documentId)
                : util.format('{"delete":{"_id":"%s"}}\n', documentId))
            .reduce((acc, row) => acc + row, '');
        return {
            method: 'post',
            url: util.format('%s/_bulk', indexName),
            headers: {
                'content-type': 'application/x-ndjson'
            },
            body: requestData
        };
    }

    /**
     * Do a request to Elasticsearch, handling pagination.
     * This implies running multiple requests to Elasticsearch and concatenating responses.
     *
     * @param {object} requestDetails details of the Elasticsearch request
     * @return a stream of Elasticsearch documents with additional metadata (e.g. total of documents)
     */
    _requestAllPages(request) {
        return this._request(request)
            .pipe(
                map(response => new ElasticSearchResult(request, response)),
                expand(this._requestNextPage.bind(this)),
                concatMap(result => result.response.hits.hits.map(hit => {
                    return {
                        meta: {
                            total: result.response.hits.total
                        },
                        hit: hit
                    };
                }))
            );
    }

    /*
     * Do a request to Elasticsearch for the page next to the specified result.
     * Building request for the next page requires information from the previous request and its response.
     *
     * @param {object} result of the previous Elasticsearch request
     * @return the result of the last Elasticsearch request
     */
    _requestNextPage(previousResult) {
        return previousResult.response.hits.hits.length > 0
            ? Rx.of(previousResult)
                .pipe(
                    map(result => {
                        const nextRequest = Object.assign({}, result.request);
                        const lastItem = result.response.hits.hits[result.response.hits.hits.length - 1];
                        nextRequest.body.search_after = lastItem.sort;
                        return nextRequest;
                    }),
                    flatMap(request => this._request(request)
                        .pipe(
                            map(response => new ElasticSearchResult(request, response))
                        ))
                )
            : Rx.empty();
    }

    /**
     * Do a request to Elasticsearch
     *
     * @param {object} requestDetails details of the Elasticsearch request
     * @return the response to the request
     */
    _request(requestDetails) {
        const requestSettings = Object.assign({}, requestDetails);

        requestSettings.baseUrl = this.settings.esUrl;

        // Set request and response content type to json and also enable automatic JSON parsing
        requestSettings.json = true;

        if (this.settings.esHeaders !== undefined) {
            if (requestSettings.headers === undefined) {
                requestSettings.headers = {};
            }
            this.settings.esHeaders.forEach(header => {
                const colonIndex = header.indexOf(':');
                const headerName = header.substring(0, colonIndex);
                const headerValue = header.substring(colonIndex+1);
                requestSettings.headers[headerName] = headerValue;
            });
        }

        // Trust any SSL/TLS HTTP certificate by default
        if (!requestSettings.strictSSL) {
            requestSettings.strictSSL = false;
        }

        // If no timeout is defined then set a default one to 10s
        if (!requestSettings.timeout) {
            requestSettings.timeout = 10000;
        }

        return Rx.from(request(requestSettings));
    }
}

/**
 * Associated settings to any ElasticSearch instance
 */
ElasticSearch.Settings = class {
    constructor(esUrl, esHeaders) {
        if (esUrl === null || esUrl === undefined) {
            throw new Error('Cannot build ElasticSearch client instance with no URL');
        }
        this.esUrl = esUrl;
        this.esHeaders = esHeaders;
    }
}

/**
 * Elasticsearch request / response tuple enabling pagination.
 * We need to store result of a request to create requests for next pages, as Elasticsearch do not return current page in responses.
 */
ElasticSearchResult = class {
    constructor(request, response) {
        this.request = request;
        this.response = response;
    }
}

module.exports = {
    Settings: ElasticSearch.Settings,
    createInstance: function(settings) {
        return new ElasticSearch(settings);
    }
}