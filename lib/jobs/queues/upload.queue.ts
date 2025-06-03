import { Queue } from 'bullmq';
import {connection} from '@/lib/redis';
export const uploadProcessingQueue = new Queue('upload-processing', {
  connection,
});
