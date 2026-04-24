import { Worker } from "bullmq";
import { processUploadJob } from "./processors/upload.processor";
import { getBullmqConnection } from "./redis-connection";

const connection = getBullmqConnection();
if (connection) {
  new Worker("upload-processing", processUploadJob, { connection });
}