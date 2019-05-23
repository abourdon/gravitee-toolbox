const util = require('util')
const https = require('https')
const Axios = require('axios')
const Rx = require('rxjs')
const { take, concatMap, map, tap, flatMap } = require('rxjs/operators')

/**
 * Base class for Gravitee APIM's Management API actions.
 * 
 * @author Aurelien Bourdon
 */
class ManagementApi {

    constructor(managementApiSettings) {
        this.settings = managementApiSettings;
    }

    /**
     * Ask for login, based on the Apim instance's Apim.Settings.
     * Once logged, then set the Apim instance's Apim.Settings by the login bearer token
     * 
     * @returns {Obervable}
     */
    login() {
        const that = this;
        return this._request({
            method: 'post',
            url: 'user/login',
            auth: {
                username: that.settings.username,
                password: that.settings.password
            }
        }).pipe(
            // Add the login bearer token to the current Apim.Settings
            tap(access => that.settings.bearer = access.token)
        );
    }

    /**
     * Ask for logout, based on the Apim instance's Apim.Settings.
     * Once logout, then remove the Apim instance's Apim.Settings login bearer token
     * 
     * @returns {Observable}
     */
    logout() {
        const that = this;
        return this._request({
            method: 'post',
            url: 'user/logout'
        }).pipe(
            // Remove the login bearer token
            tap(_answer => delete that.settings.bearer)
        )
    }

    /**
     * List all APIs according to the optional query parameter.
     * Each matched API is emitted individually, by allowing delay between events according to the given delayPeriod (by default 50 milliseconds) in order to avoid huge flooding in case of high number of APIs.
     * 
     * @param {number} delayPeriod the delay period to temporize API broadcast (by default 50 milliseconds)
     * @param {string} query the optional full text query to filter list APIs request
     */
    listApis(delayPeriod = 50, query) {
        const requestSettings = query ? {
            method: 'post',
            url: 'apis/_search',
            params: {
                q: query
            }
        } : {
                method: 'get',
                url: 'apis'
            };
        return this
            ._request(requestSettings)
            .pipe(
                // Emit each API foud
                flatMap(apis => Rx.from(apis)),

                // Apply delay between API emission
                concatMap(api => Rx
                    .interval(delayPeriod)
                    .pipe(
                        take(1),
                        map(_second => api)
                    )
                )
            )
    }

    /**
     * Get export of the API with given apiId
     * 
     * @param {string} apiId to identify the API to export
     * @param {string} exclude list of fields to exclude from export (e.g 'pages,groups')
     */
    export(apiId, exclude) {
        const requestSettings = {
            method: 'get',
            url: util.format('apis/%s/export', apiId)
        }
        if (exclude) {
            requestSettings.params = {
                exclude: exclude
            }
        }
        return this._request(requestSettings)
            .pipe(
                // Add the API identifier to the export to be eventually used later
                map(api => {
                    api.id = apiId;
                    return api;
                })
            );
    }

    /**
     * Create or update the given API definition.
     * 
     * @param {object} api the API definition to create or update
     * @param {string} apiId if given then update API with apiId identifier with the given API definition
     */
    import(api, apiId) {
        const requestSettings = {
            method: 'post',
            data: api
        }
        requestSettings.url = apiId ? util.format('apis/%s/import', apiId) : 'apis/import';
        return this._request(requestSettings);
    }

    /**
     * Do a request to the Management API
     * 
     * @param {object} requestDetails details of the Management API request
     */
    _request(requestDetails) {
        const requestSettings = Object.assign({}, requestDetails);
        requestSettings.baseURL = this.settings.apimUrl
        // If login bearer is present, then add it to the request and eventually remove any configured authorization
        if (this.settings.bearer) {
            requestSettings.headers = Object.assign({}, requestSettings.headers);
            requestSettings.headers.Cookie = util.format('%s=Bearer %s', 'Auth-Graviteeio-APIM', this.settings.bearer);
            delete requestSettings.auth;
        }
        // Trust any SSL/TLS HTTP certificate by default
        if (!requestSettings.httpsAgent) {
            requestSettings.httpsAgent = new https.Agent({
                rejectUnauthorized: false
            })
        }
        // If no timeout is defined then set a default one to 10s
        if (!requestSettings.timeout) {
            requestSettings.timeout = 10000;
        }
        return Rx.from(Axios.request(requestSettings))
            .pipe(
                // Only emit answer data
                map(answer => answer.data)
            );
    }
}

/**
 * Associated settings to any ManagementAPI instance
 */
ManagementApi.Settings = class {
    constructor(apimUrl, username, password) {
        this.apimUrl = apimUrl;
        this.username = username;
        this.password = password;
    }
}

module.exports = {
    Settings: ManagementApi.Settings,
    createInstance: function (settings) {
        return new ManagementApi(settings);
    }
}