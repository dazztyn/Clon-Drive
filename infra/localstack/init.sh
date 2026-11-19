#!/bin/bash
# LocalStack lo ejecuta al quedar listo (montado en /etc/localstack/init/ready.d)
set -e

awslocal s3 mb s3://clon-drive
awslocal sqs create-queue --queue-name uploads

echo "Bucket clon-drive y cola uploads creados"
