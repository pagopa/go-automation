#!/bin/bash

# Check if upload_file.sh script is available
if [ ! -s ./upload_file.sh ]
then
    cat << EOF 

WARN: This script works as wrapper for the 'upload_file.sh' bash script and this file is not available in this folder.
      Please, retrive from the remote repo the file, than try again. Exit.

EOF
    exit 0
fi

if [ $# -eq 0 ] || [ $1 == '--help' ] || [ $1 == '-h' ];
then
  cat << EOF
 
  This script works as wrapper for the 'upload_file.sh' bash script.
  
  Usage: $0 <CX> <DOC_TYPE> <path/to/files> <SSH_TUNNEL_LOCAL_PORT>

  ----------------------------------------------------
  CX 			| DOC_TYPE
  ----------------------------------------------------
  pn-delivery		| PN_NOTIFICATION_ATTACHMENTS
  pn-delivery-push	| PN_AAR, PN_LEGAL_FACTS
  pn-external-channels	| PN_EXTERNAL_LEGAL_FACTS
  ----------------------------------------------------

EOF
    exit 0
fi

CX="$1"
DOC_TYPE="$2"
FILES="$3"
SSH_TUNNEL_LOCAL_PORT="$4"

# ---------------------------

mkdir -p ./tmp_upload_file # tmp folder
export TMPDIR="./tmp_upload_file"
DATE=$(date +%Y%m%d_%H%M%S)

for I in $(ls -1 $FILES)
do
./upload_file.sh -a localhost:${SSH_TUNNEL_LOCAL_PORT} \
  -f ${FILES}/${I} \
  -t ${DOC_TYPE} \
  -c ${CX} > tmp.txt 2>&1
        SHA256=$(grep -P "< x-amz-checksum-sha256:" tmp.txt | awk '{print $3}')
        FILEKEY=$(grep -oP "(?<=key\":\").+\.pdf" tmp.txt)
        echo "${I} | ${FILEKEY} | ${SHA256}" >> upload_results_${DATE}.txt
        rm tmp.txt
done

rm -rf ./tmp_upload_file # remove tmp folder
unset TMPDIR

