#!/bin/bash

DUMP_OLD=$1
DUMP_NEW=$2
DATE=$(date +%Y%m%d_%H%M%S)

if [ $1 == '-h' ] || [ $1 == '--help' ] || [ $# -ne 2 ]
then
    cat << EOF 

    Usage: $0 <dump old> <dump new>
    
EOF
    exit 0
fi

function _extract_MD5s_from_dump_messages {
    local DUMP=$1
    jq -cr '.[] | {MD5OfBody: .MD5OfBody, MD5OfMessageAttributes: .MD5OfMessageAttributes}' \
        $DUMP | sort
}

_extract_MD5s_from_dump_messages $DUMP_NEW > ${DATE}_new_MD5s.txt
_extract_MD5s_from_dump_messages $DUMP_OLD > ${DATE}_old_MD5s.txt

grep -f ${DATE}_new_MD5s.txt ${DATE}_old_MD5s.txt > ${DATE}_equ_MD5s.txt
rm ${DATE}_new_MD5s.txt ${DATE}_old_MD5s.txt

EQU_LINE_COUNT=$(wc -l ${DATE}_equ_MD5s.txt | grep -oP '^\d*')
if [ ${EQU_LINE_COUNT} -eq 0 ]
then
    echo -e "\nYour dumps are different. Exit.\n"
    exit 0
fi

echo -e "\nThere are $EQU_LINE_COUNT equal messages in your dumps. Creating a jsonl file with these messages..."
jq -c '.[]' $DUMP_NEW > ${DUMP_NEW}l

sed 's/","MD5OfMessageAttributes":"/.*/g' ${DATE}_equ_MD5s.txt | \
sed 's/{"MD5OfBody":"//g' | \
sed 's/"}//g' > ${DATE}_equ_patterns_MD5s.txt
grep -f ${DATE}_equ_patterns_MD5s.txt ${DUMP_NEW}l >> ${DATE}_equ_${DUMP_NEW}l

rm  ${DUMP_NEW}l ${DATE}_equ_MD5s.txt ${DATE}_equ_patterns_MD5s.txt
echo -e "\nDone.\n"










