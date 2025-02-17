// @ts-ignore
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { DoubleSide, Material, MeshLambertMaterial } from 'three';
import { IfcMesh, IfcModel } from 'web-ifc-three/IFC/BaseDefinitions';
import { IFCLoader } from 'web-ifc-three/IFCLoader';
import { IfcComponent, Context } from '../../base-types';
import { IfcSelection } from './selection';
import { VisibilityManager } from './visibility-manager';

export class IfcManager extends IfcComponent {
  loader: IFCLoader;
  visibility: VisibilityManager;
  private preselection: IfcSelection;
  private selection: IfcSelection;
  private readonly context: Context;
  private readonly selectMat: Material | undefined;
  private readonly preselectMat: Material | undefined;
  private readonly defPreselectMat: Material;
  private readonly defSelectMat: Material;

  constructor(context: Context) {
    super(context);
    this.context = context;
    this.loader = new IFCLoader();
    this.setupThreeMeshBVH();
    this.visibility = new VisibilityManager(this.loader, this.context);
    this.defSelectMat = this.initializeDefMaterial(0xff33ff, 0.3);
    this.defPreselectMat = this.initializeDefMaterial(0xffccff, 0.5);
    this.selectMat = context.options.selectMaterial || this.defSelectMat;
    this.preselectMat = context.options.preselectMaterial || this.defPreselectMat;
    this.preselection = new IfcSelection(context, this.loader, this.preselectMat);
    this.selection = new IfcSelection(context, this.loader, this.selectMat);
  }

  /**
   * Loads the given IFC in the current scene.
   * @file IFC as File.
   * @fitToFrame (optional) if true, brings the camera to the loaded IFC.
   */
  async loadIfc(file: File, fitToFrame = false) {
    const url = URL.createObjectURL(file);
    await this.loadIfcUrl(url, fitToFrame);
  }

  /**
   * Loads the given IFC in the current scene.
   * @file IFC as URL.
   * @fitToFrame (optional) if true, brings the camera to the loaded IFC.
   */
  async loadIfcUrl(url: string, fitToFrame = false) {
    try {
      const ifcModel = (await this.loader.loadAsync(url)) as IfcModel;
      this.addIfcModel(ifcModel.mesh);
      if (fitToFrame) this.context.fitToFrame();
    } catch (err) {
      console.error('Error loading IFC.');
      console.error(err);
    }
  }

  /**
   * Sets the relative path of web-ifc.wasm file in the project.
   * Beware: you **must** serve this file in your page; this means
   * that you have to copy this files from *node_modules/web-ifc*
   * to your deployment directory.
   *
   * If you don't use this methods,
   * IFC.js assumes that you are serving it in the root directory.
   *
   * Example if web-ifc.wasm is in dist/wasmDir:
   * `ifcLoader.setWasmPath("dist/wasmDir/");`
   *
   * @path Relative path to web-ifc.wasm.
   */
  setWasmPath(path: string) {
    this.loader.ifcManager.setWasmPath(path);
  }

  /**
   * Gets the spatial structure of the specified model.
   * @modelID ID of the IFC model.
   */
  getSpatialStructure(modelID: number) {
    return this.loader.ifcManager.getSpatialStructure(modelID);
  }

  /**
   * Gets the properties of the specified item.
   * @modelID ID of the IFC model.
   * @id Express ID of the item.
   * @indirect If true, also returns psets, qsets and type properties.
   */
  getProperties(modelID: number, id: number, indirect: boolean) {
    if (modelID == null || id == null) return null;
    const props = this.loader.ifcManager.getItemProperties(modelID, id);
    if (indirect) {
      props.psets = this.loader.ifcManager.getPropertySets(modelID, id);
      props.type = this.loader.ifcManager.getTypeProperties(modelID, id);
    }
    return props;
  }

  /**
   * Gets the ID of the model pointed by the cursor.
   */
  getModelID() {
    const found = this.context.castRayIfc();
    if (!found) return null;
    const mesh = found.object as IfcMesh;
    if (!mesh || mesh.modelID === undefined || mesh.modelID === null) return null;
    return mesh.modelID;
  }

  /**
   * Gets all the items of the specified type in the specified IFC model.
   * @modelID ID of the IFC model.
   * @type type of element. You can import the type from web-ifc.
   * @verbose If true, also gets the properties for all the elements.
   */
  getAllItemsOfType(modelID: number, type: number, verbose = false) {
    return this.loader.ifcManager.getAllItemsOfType(modelID, type, verbose);
  }

  /**
   * Highlights the item pointed by the cursor.
   */
  prePickIfcItem = () => {
    const found = this.context.castRayIfc();
    if (!found) {
      this.preselection.removeSelectionOfOtherModel();
      return;
    }
    this.preselection.pick(found);
  };

  /**
   * Highlights the item pointed by the cursor and gets is properties.
   */
  pickIfcItem = () => {
    const found = this.context.castRayIfc();
    if (!found) return null;
    const result = this.selection.pick(found);
    if (result == null || result.modelID == null || result.id == null) return null;
    return result;
  };

  /**
   * Highlights the item with the given ID.
   * @modelID ID of the IFC model.
   * @id Express ID of the item.
   */
  pickIfcItemsByID = (modelID: number, ids: number[]) => {
    this.selection.pickByID(modelID, ids);
  };

  unpickIfcItems = () => {
    this.selection.unpick();
  };

  /**
   * Hides the selected items in the specified model
   * @modelID ID of the IFC model.
   * @ids Express ID of the elements.
   */
  hideItems(modelID: number, ids: number[]) {
    this.loader.ifcManager.hideItems(modelID, ids);
  }

  /**
   * Hides all the items of the specified model
   * @modelID ID of the IFC model.
   */
  hideAllItems(modelID: number) {
    this.loader.ifcManager.hideAllItems(modelID);
  }

  /**
   * Shows all the items of the specified model
   * @modelID ID of the IFC model.
   * @ids Express ID of the elements.
   */
  showItems(modelID: number, ids: number[]) {
    this.loader.ifcManager.showItems(modelID, ids);
  }

  /**
   * Shows all the items of the specified model
   * @modelID ID of the IFC model.
   */
  showAllItems(modelID: number) {
    this.loader.ifcManager.showAllItems(modelID);
  }

  /**
   * Makes an IFC model translucent
   * @modelID ID of the IFC model.
   */
  setModelTranslucency(modelID: number, translucent: boolean, opacity = 0.2, selectable = false) {
    const model = this.context.items.ifcModels.find((model) => model.modelID === modelID);
    if (!model) return;
    if (Array.isArray(model.material)) {
      model.material.forEach((material) => {
        if (material.userData.opacity === undefined) {
          material.userData = { transparent: material.transparent, opacity: material.opacity };
        }
        material.opacity = translucent ? opacity : material.userData.opacity;
        material.transparent = translucent ? true : material.userData.transparent;
      });
    }
    if (translucent && !selectable) {
      const index = this.context.items.pickableIfcModels.indexOf(model);
      this.context.items.pickableIfcModels.splice(index, 1);
    } else if (!this.context.items.pickableIfcModels.includes(model)) {
      this.context.items.pickableIfcModels.push(model);
    }
  }

  private addIfcModel(ifcMesh: IfcMesh) {
    this.context.items.ifcModels.push(ifcMesh);
    this.context.items.pickableIfcModels.push(ifcMesh);
    this.context.getScene().add(ifcMesh);
  }

  private setupThreeMeshBVH() {
    this.loader.ifcManager.setupThreeMeshBVH(
      computeBoundsTree,
      disposeBoundsTree,
      acceleratedRaycast
    );
  }

  private initializeDefMaterial(color: number, opacity: number) {
    return new MeshLambertMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: false,
      side: DoubleSide
    });
  }
}
