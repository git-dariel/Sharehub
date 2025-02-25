import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  where,
  query,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../database/firebase-connection";
import { logActivity } from "@/middleware/activity.logging";

export const fetchFolders = async (parentId = null) => {
  try {
    let folderQuery;
    if (parentId === undefined || parentId === null) {
      folderQuery = query(collection(db, "folders"), where("parentId", "==", null));
    } else {
      folderQuery = query(collection(db, "folders"), where("parentId", "==", parentId));
    }

    const folderSnapshot = await getDocs(folderQuery);
    let folders = folderSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
      subfolders: [],
    }));

    folders = folders.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();

      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    });
    return folders;
  } catch (error) {
    console.error("Error fetching folders:", error);
    throw error;
  }
};

export const addFolder = async (folderData) => {
  try {
    if (!folderData.name || folderData.name.length > 34 || /[^a-zA-Z0-9 ]/.test(folderData.name)) {
      throw new Error(
        "Invalid folder name. Ensure it is no longer than 34 characters and contains only alphanumeric characters and spaces."
      );
    }
    const folderPayload = {
      ...folderData,
      createdAt: serverTimestamp(),
    };
    if (folderData.parentId === undefined) {
      delete folderPayload.parentId;
    }

    const docRef = await addDoc(collection(db, "folders"), folderPayload);
    await logActivity("Create folder", { folderId: docRef.id, folderName: folderData.name });
    return { id: docRef.id, ...folderPayload, subfolders: [] };
  } catch (error) {
    console.error("Error adding folder:", error);
    throw error;
  }
};

export const deleteFolder = async (folderId) => {
  try {
    // Fetch the folder details to get the folderName
    const folderDoc = await getDoc(doc(db, "folders", folderId));
    if (!folderDoc.exists()) {
      throw new Error("Folder not found");
    }
    const folderData = folderDoc.data();
    const folderName = folderData.name;

    // Delete all files in the folder
    const fileQuery = query(collection(db, "files"), where("folderId", "==", folderId));
    const fileSnapshot = await getDocs(fileQuery);
    const fileDeletions = fileSnapshot.docs.map((fileDoc) =>
      deleteDoc(doc(db, "files", fileDoc.id))
    );
    await Promise.all(fileDeletions);

    // Delete all subfolders recursively
    const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", folderId));
    const subfolderSnapshot = await getDocs(subfolderQuery);
    const subfolderDeletions = subfolderSnapshot.docs.map((subfolderDoc) =>
      deleteFolder(subfolderDoc.id)
    );
    await Promise.all(subfolderDeletions);

    // Delete the folder itself
    await deleteDoc(doc(db, "folders", folderId));

    // Log the activity with folderId and folderName
    await logActivity("Delete folder", { folderId, folderName });
  } catch (error) {
    console.error("Error deleting folder:", error);
    throw error;
  }
};

export const handleUpdateFolder = async (folderId, updatedDetails) => {
  try {
    if (updatedDetails.name) {
      if (updatedDetails.name.length > 24 || /[^a-zA-Z0-9 ]/.test(updatedDetails.name)) {
        throw new Error(
          "Invalid folder name. Ensure it is no longer than 24 characters and contains only alphanumeric characters and spaces."
        );
      }
    }

    const folderRef = doc(db, "folders", folderId);
    await updateDoc(folderRef, updatedDetails);
    return { success: true };
  } catch (error) {
    console.error("Error updating folder:", error);
    throw error;
  }
};

export const fetchFolderDetails = async (folderId) => {
  try {
    const folderDocRef = doc(db, "folders", folderId);
    const folderDoc = await getDoc(folderDocRef);
    if (!folderDoc.exists()) {
      console.log("No such folder!");
      return null;
    }
    const data = folderDoc.data();
    const folderDetails = { id: folderDoc.id, ...data };

    if (folderDetails.parentId) {
      const parentDetails = await fetchFolderDetails(folderDetails.parentId);
      folderDetails.parent = parentDetails;
    }

    return folderDetails;
  } catch (error) {
    console.error("Error fetching folder details:", error);
    throw error;
  }
};

export const fetchFolderDetailsWithUploadLimit = async (folderId) => {
  try {
    const folderDocRef = doc(db, "folders", folderId);
    const folderDoc = await getDoc(folderDocRef);
    if (folderDoc.exists()) {
      const data = folderDoc.data();
      console.log("Folder Details:", data);
      return { id: folderDoc.id, ...data };
    } else {
      console.log("No such folder!");
      return null;
    }
  } catch (error) {
    console.error("Error fetching folder details:", error);
    throw error;
  }
};

export const processFolder = (folder) => {
  // Dummy calculation for usage percentage
  const totalFiles = folder.fileCount || 0;
  const maxFileCount = 100;
  const usagePercentage = (totalFiles / maxFileCount) * 100;

  return {
    ...folder,
    usagePercentage: Math.min(usagePercentage, 100),
  };
};

export const addAssigneeToFolder = async (folderId, assigneeData, assignSubfolders) => {
  try {
    const folderRef = doc(db, "folders", folderId);
    await updateDoc(folderRef, {
      assignees: arrayUnion(assigneeData),
    });

    if (assignSubfolders) {
      // Fetch subfolders
      const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", folderId));
      const subfolderSnapshot = await getDocs(subfolderQuery);
      const subfolderAssignments = subfolderSnapshot.docs.map((subfolderDoc) =>
        updateDoc(doc(db, "folders", subfolderDoc.id), {
          assignees: arrayUnion(assigneeData),
        })
      );

      await Promise.all(subfolderAssignments);
    }

    return { success: true };
  } catch (error) {
    console.error("Error adding assignee to folder:", error);
    throw error;
  }
};

export const removeAssigneeFromFolder = async (folderId, assigneeData) => {
  try {
    const folderRef = doc(db, "folders", folderId);
    await updateDoc(folderRef, {
      assignees: arrayRemove(assigneeData),
    });
    return { success: true };
  } catch (error) {
    console.error("Error removing assignee from folder:", error);
    throw error;
  }
};

// export const fetchFoldersForUser = async (userId, parentId = null) => {
//   try {
//     const folderQuery = query(collection(db, 'folders'), where('parentId', '==', parentId));
//     const folderSnapshot = await getDocs(folderQuery);
//     const folders = folderSnapshot.docs.map((doc) => {
//       const folderData = doc.data();
//       const createdAt = folderData.createdAt
//         ? new Date(folderData.createdAt.seconds * 1000)
//         : new Date();
//       return {
//         id: doc.id,
//         ...folderData,
//         createdAt: createdAt,
//       };
//     });

//     const filteredFolders = folders.filter(
//       (folder) =>
//         folder.assignees && folder.assignees.some((assignee) => assignee.userId === userId)
//     );

//     const files = [];
//     if (parentId) {
//       const fileQuery = query(collection(db, 'files'), where('folderId', '==', parentId));
//       const fileSnapshot = await getDocs(fileQuery);
//       const folderFiles = fileSnapshot.docs.map((doc) => {
//         const fileData = doc.data();
//         const fileCreatedAt = fileData.createdAt
//           ? new Date(fileData.createdAt.seconds * 1000)
//           : new Date();
//         return {
//           id: doc.id,
//           ...fileData,
//           createdAt: fileCreatedAt,
//         };
//       });
//       files.push(...folderFiles);
//     }

//     return { folders: filteredFolders, files };
//   } catch (error) {
//     console.error('Error fetching folders for user:', error);
//     throw error;
//   }
// };

export const fetchFoldersForUser = async (userId, parentId = null) => {
  try {
    const allFoldersQuery = query(collection(db, "folders"));
    const allFoldersSnapshot = await getDocs(allFoldersQuery);
    let allFolders = allFoldersSnapshot.docs.map((doc) => {
      const folderData = doc.data();
      const createdAt = folderData.createdAt
        ? new Date(folderData.createdAt.seconds * 1000)
        : new Date();
      return {
        id: doc.id,
        ...folderData,
        createdAt: createdAt,
      };
    });

    allFolders = allFolders.sort((a, b) => a.createdAt - b.createdAt);

    // Filter to include only those folders where the user is an assignee
    let userFolders = allFolders.filter(
      (folder) =>
        folder.assignees && folder.assignees.some((assignee) => assignee.userId === userId)
    );

    // Include parent folders of assigned subfolders to maintain hierarchy
    const parentIds = userFolders
      .filter((folder) => folder.parentId && !userFolders.some((f) => f.id === folder.parentId))
      .map((folder) => folder.parentId);

    const parentFolders = allFolders.filter((folder) => parentIds.includes(folder.id));
    userFolders = [...userFolders, ...parentFolders];

    // If parentId is null, return only root folders; otherwise, return only the subfolders of the specified parent
    if (parentId === null) {
      userFolders = userFolders.filter((folder) => !folder.parentId);
    } else {
      userFolders = userFolders.filter((folder) => folder.parentId === parentId);
    }

    // Fetch files for these folders if parentId is specified
    const files = [];
    if (parentId) {
      const fileQuery = query(collection(db, "files"), where("folderId", "==", parentId));
      const fileSnapshot = await getDocs(fileQuery);
      const folderFiles = fileSnapshot.docs.map((doc) => {
        const fileData = doc.data();
        const fileCreatedAt = fileData.createdAt
          ? new Date(fileData.createdAt.seconds * 1000)
          : new Date();
        return {
          id: doc.id,
          ...fileData,
          createdAt: fileCreatedAt,
        };
      });
      files.push(...folderFiles);
    }

    return { folders: userFolders, files };
  } catch (error) {
    console.error("Error fetching folders for user:", error);
    throw error;
  }
};

export const countAllFolders = async () => {
  try {
    const q = query(collection(db, "folders"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error("Error counting folders:", error);
    throw error;
  }
};

export const countPendingFilesInFolders = (callback) => {
  const folderQuery = query(collection(db, "folders"));
  const unsubscribe = onSnapshot(
    folderQuery,
    async (folderSnapshot) => {
      let totalPendingFiles = 0;

      const checks = folderSnapshot.docs.map(async (folderDoc) => {
        const folderId = folderDoc.id;
        const fileQuery = query(collection(db, "files"), where("folderId", "==", folderId));
        const fileSnapshot = await getDocs(fileQuery);

        if (fileSnapshot.empty) {
          totalPendingFiles++;
        }
      });

      await Promise.all(checks);
      callback(totalPendingFiles);
    },
    (error) => {
      console.error("Error tracking pending files in folders:", error);
    }
  );

  return unsubscribe;
};

export const countCompletedFilesInFolders = (callback) => {
  const folderQuery = query(collection(db, "folders"));
  const unsubscribe = onSnapshot(
    folderQuery,
    async (folderSnapshot) => {
      let totalCompletedFiles = 0;

      const checks = folderSnapshot.docs.map(async (folderDoc) => {
        const folderId = folderDoc.id;
        const fileQuery = query(collection(db, "files"), where("folderId", "==", folderId));
        const fileSnapshot = await getDocs(fileQuery);

        if (!fileSnapshot.empty) {
          totalCompletedFiles++;
        }
      });

      await Promise.all(checks);
      callback(totalCompletedFiles);
    },
    (error) => {
      console.error("Error tracking pending files in folders:", error);
    }
  );

  return unsubscribe;
};

export const calculateOverallProgress = async () => {
  try {
    const folderQuery = query(collection(db, "folders"));
    const folderSnapshot = await getDocs(folderQuery);
    const totalFolders = folderSnapshot.size;
    let completedFolders = 0;

    const folderChecks = folderSnapshot.docs.map(async (folderDoc) => {
      const folderId = folderDoc.id;
      const fileQuery = query(collection(db, "files"), where("folderId", "==", folderId));
      const fileSnapshot = await getDocs(fileQuery);
      if (!fileSnapshot.empty) {
        completedFolders++;
      }
    });

    await Promise.all(folderChecks);

    const progressPercentage = (completedFolders / totalFolders) * 100;
    return {
      totalFolders,
      completedFolders,
      progressPercentage: progressPercentage.toFixed(2) + "%",
    };
  } catch (error) {
    console.error("Error calculating overall progress:", error);
    throw error;
  }
};

// Helper function to count files in a folder and its subfolders
async function countFilesInFolderAndSubfolders(folderId, allFolders) {
  let totalFiles = 0;
  const fileSnapshot = await getDocs(
    query(collection(db, "files"), where("folderId", "==", folderId))
  );
  totalFiles += fileSnapshot.size;

  const subfolders = allFolders.filter((folder) => folder.parentId === folderId);
  for (const subfolder of subfolders) {
    totalFiles += await countFilesInFolderAndSubfolders(subfolder.id, allFolders);
  }

  return totalFiles;
}

export const countFilesInRootFolders = async () => {
  try {
    const allFoldersSnapshot = await getDocs(collection(db, "folders"));
    const allFolders = allFoldersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date(),
    }));

    const rootFolders = allFolders.filter((folder) => !folder.parentId);

    rootFolders.sort((a, b) => a.createdAt - b.createdAt);

    const rootFolderFileCounts = await Promise.all(
      rootFolders.map(async (rootFolder) => {
        const totalFiles = await countFilesInFolderAndSubfolders(rootFolder.id, allFolders);
        return {
          folderName: rootFolder.name,
          totalFiles,
        };
      })
    );

    return rootFolderFileCounts;
  } catch (error) {
    console.error("Error counting files in root folders:", error);
    throw error;
  }
};

export const fetchEmptySubfoldersPerRootFolder = (callback) => {
  const unsubscribe = onSnapshot(
    collection(db, "folders"),
    async (snapshot) => {
      const allFolders = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date(),
      }));

      const rootFolders = allFolders.filter((folder) => !folder.parentId);
      const subFolders = allFolders.filter((folder) => folder.parentId);

      // Sort root folders by createdAt
      rootFolders.sort((a, b) => a.createdAt - b.createdAt);

      const emptySubfoldersPromises = rootFolders.map(async (rootFolder) => {
        const subfoldersOfRoot = subFolders.filter(
          (subFolder) => subFolder.parentId === rootFolder.id
        );

        // Sort subfolders by createdAt
        subfoldersOfRoot.sort((a, b) => a.createdAt - b.createdAt);

        const emptySubfolders = [];

        for (const subfolder of subfoldersOfRoot) {
          const fileSnapshot = await getDocs(
            query(collection(db, "files"), where("folderId", "==", subfolder.id))
          );
          if (fileSnapshot.empty) {
            emptySubfolders.push(subfolder.name);
          }
        }

        return {
          rootFolderName: rootFolder.name,
          emptySubfolders: emptySubfolders,
        };
      });

      const emptySubfolders = await Promise.all(emptySubfoldersPromises);
      const filteredResults = emptySubfolders.filter((item) => item.emptySubfolders.length > 0);
      callback(filteredResults);
    },
    (error) => {
      console.error("Error fetching empty subfolders per root folder:", error);
    }
  );

  return unsubscribe;
};

export const fetchSubfoldersWithFilesPerRootFolder = (callback) => {
  const unsubscribe = onSnapshot(
    collection(db, "folders"),
    async (snapshot) => {
      const allFolders = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date(),
      }));

      const rootFolders = allFolders.filter((folder) => !folder.parentId);
      const subFolders = allFolders.filter((folder) => folder.parentId);

      // Sort root folders by createdAt
      rootFolders.sort((a, b) => a.createdAt - b.createdAt);

      const subfoldersWithFilesPromises = rootFolders.map(async (rootFolder) => {
        const subfoldersOfRoot = subFolders.filter(
          (subFolder) => subFolder.parentId === rootFolder.id
        );

        // Sort subfolders by createdAt
        subfoldersOfRoot.sort((a, b) => a.createdAt - b.createdAt);

        const subfoldersWithFiles = [];

        for (const subfolder of subfoldersOfRoot) {
          const fileSnapshot = await getDocs(
            query(collection(db, "files"), where("folderId", "==", subfolder.id))
          );
          if (!fileSnapshot.empty) {
            subfoldersWithFiles.push(subfolder.name);
          }
        }

        return {
          rootFolderName: rootFolder.name,
          subfoldersWithFiles: subfoldersWithFiles,
        };
      });

      const subfoldersWithFiles = await Promise.all(subfoldersWithFilesPromises);
      const filteredResults = subfoldersWithFiles.filter(
        (item) => item.subfoldersWithFiles.length > 0
      );
      callback(filteredResults);
    },
    (error) => {
      console.error("Error fetching subfolders with files per root folder:", error);
    }
  );

  return unsubscribe;
};

export const fetchAreaOneFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 1"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));

        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 1 folders and files:", error);
    throw error;
  }
};

export const fetchAreaTwoFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 2"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaThreeFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 3"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaFourFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 4"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaFiveFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 5"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaSixFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 6"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaSevenFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 7"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaEightFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 8"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaNineFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 9"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};

export const fetchAreaTenFoldersAndFiles = async () => {
  try {
    // Fetch the root folder named "Area 1"
    const rootFolderQuery = query(collection(db, "folders"), where("name", "==", "Area 10"));
    const rootFolderSnapshot = await getDocs(rootFolderQuery);
    const rootFolders = await Promise.all(
      rootFolderSnapshot.docs.map(async (doc) => {
        const folderData = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          subfolders: [],
          files: [],
        };

        // Fetch files directly under the root folder
        const fileQuery = query(collection(db, "files"), where("folderId", "==", doc.id));
        const fileSnapshot = await getDocs(fileQuery);
        folderData.files = fileSnapshot.docs.map((fileDoc) => ({
          id: fileDoc.id,
          ...fileDoc.data(),
        }));
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));

        // Fetch subfolders and their files
        const subfolderQuery = query(collection(db, "folders"), where("parentId", "==", doc.id));
        const subfolderSnapshot = await getDocs(subfolderQuery);
        folderData.subfolders = await Promise.all(
          subfolderSnapshot.docs.map(async (subDoc) => {
            const subfolderData = {
              id: subDoc.id,
              ...subDoc.data(),
              createdAt: subDoc.data().createdAt.toDate(),
              files: [],
            };

            const subFileQuery = query(collection(db, "files"), where("folderId", "==", subDoc.id));
            const subFileSnapshot = await getDocs(subFileQuery);
            subfolderData.files = subFileSnapshot.docs.map((fileDoc) => ({
              id: fileDoc.id,
              ...fileDoc.data(),
            }));
            subfolderData.files.sort((a, b) => a.name.localeCompare(b.name));
            return subfolderData;
          })
        );
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
        return folderData;
      })
    );
    rootFolders.sort((a, b) => a.createdAt - b.createdAt);
    return rootFolders;
  } catch (error) {
    console.error("Error fetching Area 2 folders and files:", error);
    throw error;
  }
};
