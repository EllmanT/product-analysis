"use server";


import { ProductMaster } from "@/database";
import action from "../handlers/action";
import handleError from "../handlers/error";
import { GlobalSearchSchema } from "../validations";
import { GlobalSearchParams } from "@/types/action";

export async function globalSearch(params: GlobalSearchParams) {
  try {
    console.log("QUERY", params);

    const validationResult = await action({
      params,
      schema: GlobalSearchSchema,
    });

    if (validationResult instanceof Error) {
      return handleError(validationResult) as ErrorResponse;
    }

    const { query, type } = params;
    const regexQuery = { $regex: query, $options: "i" };

    let results = [];

    const modelsAndTypes = [
      { model: ProductMaster, searchField: "name", type: "product" },
      { model: ProductMaster, searchField: "standardCode", type: "code" },
    ];

    const typeLower = type?.toLowerCase();

    console.log(type)
    console.log(typeLower)
    const SearchableTypes = ["product", "code"];
    if (!typeLower || !SearchableTypes.includes(typeLower)) {
      // If no type is specified, search in all models
      for (const { model, searchField, type } of modelsAndTypes) {
        const queryResults = await model
          .find({ [searchField]: regexQuery })
          .limit(2);

        results.push(
          ...queryResults.map((item) => ({
            title: item.name,
            code: item.standardCode,
            type,
            id: item._id,
          }))
        );
      }
    } else {
      // Search in the specified model type
      const modelInfo = modelsAndTypes.find((item) => item.type === type);

      if (!modelInfo) {
        throw new Error("Invalid search type");
      }

      const queryResults = await modelInfo.model
        .find({ [modelInfo.searchField]: regexQuery })
        .limit(8);

      results = queryResults.map((item) => ({
        title:
          type === "answer"
            ? `Answers containing ${query}`
            : item[modelInfo.searchField],
        type,
        id: type === "product" ? item.name : item._id,
      }));
    }

    console.log(results);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(results)),
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}
