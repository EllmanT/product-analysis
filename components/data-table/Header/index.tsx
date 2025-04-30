import { Button } from "@/components/ui/button";
import SearchBar from "./SearchBar";
import { StoreIcon } from "lucide-react";

const DataTableTopHeader = ({isVisible, label, color}:{isVisible?:boolean, label?:string, color?:string}) => {
  return (
    <div className="flex flex-row justify-between items-center px-8 pt-4">
      <Button className={`${color ? color:""}`}>
        <StoreIcon className="w-4 h-4 mr-1" />
         {label}
      </Button>
      
      {isVisible && 
            <SearchBar />

      }

      
    </div>
  );
};

export default DataTableTopHeader;
