import React, { memo, useState } from "react";
import { Link } from "react-router-dom";
import { RiFolderLine, RiFolderOpenLine } from "react-icons/ri";

const FolderItem = memo(({ folder, isGridView, onDoubleClick, usagePercentage }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleDoubleClick = () => {
    setIsOpen(!isOpen);
    onDoubleClick(folder.id);
  };

  const folderUrl = `/folders/${folder.id}`;

  return (
    <Link to={folderUrl} onDoubleClick={handleDoubleClick}>
      <div
        className={`cursor-default ${
          isGridView ? "flex-col m-2 p-2 border" : "w-full border-y"
        } text-sm flex items-center space-x-2 border-gray-200 hover:bg-gray-100`}
        onDoubleClick={handleDoubleClick}
      >
        {isOpen ? (
          <RiFolderOpenLine className="h-8 w-8 text-gray-600" />
        ) : (
          <RiFolderLine className="h-8 w-8 text-gray-600" />
        )}
        <span className="truncate">{folder.name}</span>
        {usagePercentage > 0 && (
          <span className="ml-auto">{usagePercentage}%</span>
        )}
      </div>
    </Link>
  );
});

export default FolderItem;