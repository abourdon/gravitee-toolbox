# [Gravitee.io API Management](https://gravitee.io/products/apim/)'s MongoDB dedicated scripts

Any script here can be executed by using the `mongo` command line as follows:

```bash
$ mongo [OPTIONS] gravitee <script>.js
```

Where `[OPTIONS]` are usually filled by credentials and server information to access to the `gravitee` database. For example:


```bash
$ mongo -u gravitee -p "<the gravitee user password>" --host $(hostname -i) --port 27017 gravitee <script>.js
```

Note, some scripts could requires some parameters, to do so, you can use the following syntax:

```bash
$ mongo [OPTIONS] --eval "var arg1='value1', arg2='value2'" gravitee <script>.js
```