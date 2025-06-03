import { Worker } from 'bullmq';
import {connection} from "../redis"
import { processUploadJob } from './processors/upload.processor';

new Worker('upload-processing', processUploadJob, { connection});