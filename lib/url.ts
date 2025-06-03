import qs from "query-string";
interface urlQueryParams {
  params: string;
  key: string;
  value: string;
}
interface RemoveUrlQueryParams {
  params: string;
  keysToRemove: string[];
}

export const formUrlQuery = ({ params, key, value }: urlQueryParams) => {
  const queryString = qs.parse(params); // parse existing params

  // Add or update the key-value pair
  queryString[key] = value;

  // Rebuild and return the full URL string
  return qs.stringifyUrl({
    url: window.location.pathname,
    query: queryString,
  }, { skipNull: true, skipEmptyString: true });
};

export const removeKeysFromUrlQuery = ({
  params,
  keysToRemove,
}: RemoveUrlQueryParams) => {
  const queryString = qs.parse(params);

  keysToRemove.forEach((key) => {
    delete queryString[key];
  });

  return qs.stringifyUrl(
    {
      url: window.location.pathname,
      query: queryString,
    },
    { skipNull: true }
  );
};
