#!/usr/bin/env sh
#
# gravitee-cli: Command line to interact with the Gravitee.io Management API
#
# @author Aurelien Bourdon

#################################################
# Internal variables                            #
#################################################

# Application name
readonly APP=`basename $0`

# Log levels
readonly INFO='INFO'
readonly ERROR='ERROR'

# Command files related variables
readonly COMMAND_PATH='./commands'
readonly COMMAND_EXTENSION='.js'

#################################################
# Internal functions                            #
#################################################

# Print a log to console
#
# @param $1 log level
# @param $2 message content
# @return nothing
function log {
    local now=`date`
    local level="$1"
    local message="$2"
    echo "$APP $now [$level] $message"
}

# Display help message and exit
#
# @param nothing
# @return nothing
function help {
    local availableCommands=`ls commands/*.js | while read command; do basename $command | cut -d '.' -f 1; done`

    echo "$APP: Gravitee Management API command line"
    echo "Usage: $APP [OPTIONS] [COMMAND [COMMAND_OPTIONS]]"
    echo ''
    echo 'OPTIONS:'
    echo '  -h, --help       Display this helper message.'
    echo ''
    echo 'COMMAND:'
    echo '  Command to execute with its optional COMMAND_OPTIONS. Use -h/--help to display helper associated to the COMMAND.'
    echo "  Available COMMANDs: `echo $availableCommands | tr "\n" ' '`"

    exit 0
}

# Main entry point
#
# @param $@ the program arguments
# @return nothing
function main {
  # Check if help is needed
  local firstOption=$1
  if [ ! $firstOption ] || [ $firstOption = '-h' ] || [ $firstOption = '--help' ]; then
    help
  fi

  # Check if command exists
  if ! `ls $COMMAND_PATH/$firstOption$COMMAND_EXTENSION > /dev/null 2>&1` ; then
    log $ERROR "Command '$firstOption' does not exist. Use -h/--help for more details"
    exit 1
  fi
  # And only keep command arguments
  shift

  # Finally execute the command
  node $COMMAND_PATH/$firstOption$COMMAND_EXTENSION "$@"
}

#################################################
# Execution                                     #
#################################################

main "$@"