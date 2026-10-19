#pragma once

// CAD Viewer additions: exact B-rep topology extraction and per-part export.

#include <string>
#include <vector>

#include <TopoDS_Shape.hxx>
#include <TopoDS_Face.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <emscripten/val.h>

// One hierarchy node that produced meshes, with the whole B-rep it was built from.
struct NodeRecord
{
    std::string partId;
    TopoDS_Shape shape;
};

// The faces of one unit shape in traversal order (index 1..Extent). The single definition of face
// order: BuildTopology numbers topology.faces from it and the mesh writer looks up brep_faces[].faceId.
void MapUnitFaces (const TopoDS_Shape& shape, TopTools_IndexedMapOfShape& faceMap);

// Builds { vertices, edges, faces } for the nodes, in node order, with global v_/e_/f_ id counters.
// Within a node, entities follow the OCCT traversal order of the node's shape.
emscripten::val BuildTopology (const std::vector<NodeRecord>& records);
