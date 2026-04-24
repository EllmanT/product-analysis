import { Queue } from "bullmq";
import { getBullmqConnection } from "@/lib/jobs/redis-connection";

const connection = getBullmqConnection();

export const uploadProcessingQueue = connection
  ? new Queue("upload-processing", { connection })
  : null;
