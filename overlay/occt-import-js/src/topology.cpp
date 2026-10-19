#ifdef EMSCRIPTEN

#include "topology.hpp"

#include <cmath>
#include <map>
#include <string>

#include <BRep_Tool.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <GeomAbs_CurveType.hxx>
#include <GeomAbs_SurfaceType.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <gp_Ax1.hxx>
#include <gp_Circ.hxx>
#include <gp_Cone.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <gp_Pnt.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>

using emscripten::val;

namespace
{

val Vec3 (double x, double y, double z)
{
    val arr (val::array ());
    arr.set (0, x);
    arr.set (1, y);
    arr.set (2, z);
    return arr;
}

val Vec3 (const gp_Pnt& p)
{
    return Vec3 (p.X (), p.Y (), p.Z ());
}

val Vec3 (const gp_Dir& d)
{
    return Vec3 (d.X (), d.Y (), d.Z ());
}

std::string Id (const char* prefix, int index)
{
    return std::string (prefix) + std::to_string (index);
}

const char* FaceKindName (GeomAbs_SurfaceType type)
{
    switch (type) {
        case GeomAbs_Plane: return "plane";
        case GeomAbs_Cylinder: return "cylinder";
        case GeomAbs_Cone: return "cone";
        case GeomAbs_Sphere: return "sphere";
        case GeomAbs_Torus: return "torus";
        case GeomAbs_BezierSurface:
        case GeomAbs_BSplineSurface: return "bspline";
        default: return "other";
    }
}

const char* CurveKindName (GeomAbs_CurveType type)
{
    switch (type) {
        case GeomAbs_Line: return "line";
        case GeomAbs_Circle: return "circle";
        case GeomAbs_Ellipse: return "ellipse";
        case GeomAbs_BezierCurve:
        case GeomAbs_BSplineCurve: return "bspline";
        default: return "other";
    }
}

int SampleCount (GeomAbs_CurveType type)
{
    switch (type) {
        case GeomAbs_Line: return 2;
        case GeomAbs_Circle: return 64;
        case GeomAbs_Ellipse: return 40;
        case GeomAbs_BezierCurve:
        case GeomAbs_BSplineCurve: return 32;
        default: return 20;
    }
}

val FaceEntry (const TopoDS_Face& face, const std::string& id, const std::string& partId)
{
    val obj (val::object ());
    obj.set ("id", id);
    obj.set ("partId", partId);

    BRepAdaptor_Surface surface (face);
    GeomAbs_SurfaceType type = surface.GetType ();
    obj.set ("kind", std::string (FaceKindName (type)));

    switch (type) {
        case GeomAbs_Plane: {
            gp_Pln pln = surface.Plane ();
            val analytic (val::object ());
            analytic.set ("origin", Vec3 (pln.Location ()));
            analytic.set ("normal", Vec3 (pln.Axis ().Direction ()));
            obj.set ("analytic", analytic);
            break;
        }
        case GeomAbs_Cylinder: {
            gp_Cylinder cyl = surface.Cylinder ();
            val analytic (val::object ());
            analytic.set ("origin", Vec3 (cyl.Location ()));
            analytic.set ("axis", Vec3 (cyl.Axis ().Direction ()));
            analytic.set ("radius", cyl.Radius ());
            obj.set ("analytic", analytic);
            break;
        }
        case GeomAbs_Cone: {
            gp_Cone cone = surface.Cone ();
            val analytic (val::object ());
            analytic.set ("origin", Vec3 (cone.Location ()));
            analytic.set ("axis", Vec3 (cone.Axis ().Direction ()));
            analytic.set ("radius", cone.RefRadius ());
            obj.set ("analytic", analytic);
            break;
        }
        case GeomAbs_Sphere: {
            gp_Sphere sph = surface.Sphere ();
            val analytic (val::object ());
            analytic.set ("origin", Vec3 (sph.Location ()));
            analytic.set ("axis", Vec3 (sph.Position ().Direction ()));
            analytic.set ("radius", sph.Radius ());
            obj.set ("analytic", analytic);
            break;
        }
        case GeomAbs_Torus: {
            gp_Torus tor = surface.Torus ();
            val analytic (val::object ());
            analytic.set ("origin", Vec3 (tor.Location ()));
            analytic.set ("axis", Vec3 (tor.Axis ().Direction ()));
            analytic.set ("radius", tor.MajorRadius ());
            obj.set ("analytic", analytic);
            break;
        }
        default:
            break;
    }
    return obj;
}

} // namespace

val BuildTopology (const std::vector<NodeRecord>& records)
{
    val vertices (val::array ());
    val edges (val::array ());
    val faces (val::array ());
    int vertexCount = 0;
    int edgeCount = 0;
    int faceCount = 0;

    for (const NodeRecord& record : records) {
        const std::string& partId = record.partId;
        const TopoDS_Shape& shape = record.shape;
        if (shape.IsNull ()) {
            continue;
        }

        // faces in traversal order of the node shape
        TopTools_IndexedMapOfShape faceMap;
        TopExp::MapShapes (shape, TopAbs_FACE, faceMap);
        const int groupFaceBase = faceCount;
        for (int i = 1; i <= faceMap.Extent (); i++) {
            faces.set (faceCount, FaceEntry (TopoDS::Face (faceMap (i)), Id ("f_", faceCount), partId));
            faceCount++;
        }

        // edges with their ancestor faces (a seam edge lists its face twice); free edges come last
        TopTools_IndexedDataMapOfShapeListOfShape edgeMap;
        TopExp::MapShapesAndAncestors (shape, TopAbs_EDGE, TopAbs_FACE, edgeMap);

        TopTools_IndexedMapOfShape vertexMap;
        TopExp::MapShapes (shape, TopAbs_VERTEX, vertexMap);

        const int groupVertexBase = vertexCount;
        for (int i = 1; i <= vertexMap.Extent (); i++) {
            const TopoDS_Vertex& vertex = TopoDS::Vertex (vertexMap (i));
            val obj (val::object ());
            obj.set ("id", Id ("v_", vertexCount));
            obj.set ("partId", partId);
            obj.set ("point", Vec3 (BRep_Tool::Pnt (vertex)));
            obj.set ("tolerance", BRep_Tool::Tolerance (vertex));
            vertices.set (vertexCount, obj);
            vertexCount++;
        }

        for (int i = 1; i <= edgeMap.Extent (); i++) {
            const TopoDS_Edge& edge = TopoDS::Edge (edgeMap.FindKey (i));
            val obj (val::object ());
            obj.set ("id", Id ("e_", edgeCount));
            obj.set ("partId", partId);

            TopoDS_Vertex v1, v2;
            TopExp::Vertices (edge, v1, v2);
            val vertexIds (val::array ());
            vertexIds.set (0, Id ("v_", groupVertexBase + vertexMap.FindIndex (v1) - 1));
            vertexIds.set (1, Id ("v_", groupVertexBase + vertexMap.FindIndex (v2) - 1));
            obj.set ("vertexIds", vertexIds);

            std::vector<int> adj;
            for (TopTools_ListIteratorOfListOfShape it (edgeMap.FindFromIndex (i)); it.More (); it.Next ()) {
                adj.push_back (groupFaceBase + faceMap.FindIndex (it.Value ()) - 1);
            }
            val adjIds (val::array ());
            for (size_t k = 0; k < adj.size (); k++) {
                adjIds.set ((int) k, Id ("f_", adj[k]));
            }
            obj.set ("adjacentFaceIds", adjIds);

            const char* kind = "boundary";
            if (adj.size () == 2) {
                kind = (adj[0] == adj[1]) ? "seam" : "sharp";
            } else if (adj.size () == 1 && BRep_Tool::Degenerated (edge)) {
                kind = "degenerated";
            }
            obj.set ("kind", std::string (kind));

            BRepAdaptor_Curve curve (edge);
            GeomAbs_CurveType type = curve.GetType ();
            obj.set ("curveKind", std::string (CurveKindName (type)));
            obj.set ("closed", false);
            obj.set ("periodic", (bool) curve.IsPeriodic ());
            obj.set ("tolerance", BRep_Tool::Tolerance (edge));

            const double first = curve.FirstParameter ();
            const double last = curve.LastParameter ();
            const int n = SampleCount (type);
            val samples (val::array ());
            for (int k = 0; k < n; k++) {
                double t = first + (last - first) * ((double) k / (double) (n - 1));
                gp_Pnt p = curve.Value (t);
                samples.set (k * 3, p.X ());
                samples.set (k * 3 + 1, p.Y ());
                samples.set (k * 3 + 2, p.Z ());
            }
            obj.set ("samplePositions", samples);

            if (type == GeomAbs_Circle) {
                gp_Circ circ = curve.Circle ();
                val analytic (val::object ());
                analytic.set ("radius", circ.Radius ());
                analytic.set ("diameter", circ.Radius () * 2.0);
                analytic.set ("center", Vec3 (circ.Location ()));
                analytic.set ("axis", Vec3 (circ.Axis ().Direction ()));
                analytic.set ("normal", Vec3 (circ.Axis ().Direction ()));
                analytic.set ("midPoint", Vec3 (curve.Value ((first + last) * 0.5)));
                analytic.set ("startPoint", Vec3 (BRep_Tool::Pnt (v1)));
                analytic.set ("endPoint", Vec3 (BRep_Tool::Pnt (v2)));
                // Reference behaviour (kept for byte-compatibility): every circle edge reports a full
                // 2*pi sweep, even for arcs.
                analytic.set ("sweepAngleRad", 2.0 * M_PI);
                analytic.set ("isFullCircle", true);
                obj.set ("analytic", analytic);
            }

            edges.set (edgeCount, obj);
            edgeCount++;
        }

    }

    val topology (val::object ());
    topology.set ("vertices", vertices);
    topology.set ("edges", edges);
    topology.set ("faces", faces);
    return topology;
}

#endif
